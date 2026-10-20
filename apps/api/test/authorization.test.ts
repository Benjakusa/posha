import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Role } from '@posha/shared';
import type { AuthStore } from '../src/auth/auth-store.js';
import type { AuthService } from '../src/auth/auth.service.js';
import { FeatureFlagsService } from '../src/flags/feature-flags.service.js';
import { evaluateAuthorization } from '../src/policies/authorization-policy.js';
import {
  AccountStatusGuard,
  AgeLevelGuard,
  AuthGuard,
  FeatureGateGuard,
  OwnershipPolicyGuard,
  OWNERSHIP_RESOLVER,
  RateLimitGuard,
  RoleGuard,
} from '../src/policies/policy.guards.js';
import {
  RequiredAge,
  RequiredFeatureGate,
  RequiredOwnership,
  RequiredRoles,
  RateLimit,
} from '../src/policies/policy-metadata.js';
import { MemoryRateLimitStore } from '../src/policies/rate-limit.store.js';

const member = { sub: 'user-1', roles: ['member'] as Role[] };

describe('deny-by-default authorization harness', () => {
  const cases = [
    {
      name: 'anonymous requests',
      input: { principal: null },
      expected: { allowed: false, status: 401, code: 'UNAUTHORIZED' },
    },
    {
      name: 'suspended accounts',
      input: { principal: member, accountStatus: 'suspended' as const },
      expected: { allowed: false, status: 403, code: 'ACCOUNT_INACTIVE' },
    },
    {
      name: 'age below the route minimum',
      input: {
        principal: member,
        accountStatus: 'active' as const,
        ageLevel: 'L0' as const,
        minimumAgeLevel: 'L2' as const,
      },
      expected: { allowed: false, status: 403, code: 'AGE_LEVEL_REQUIRED' },
    },
    {
      name: 'wrong role',
      input: {
        principal: member,
        accountStatus: 'active' as const,
        anyRole: ['finance_admin'] as Role[],
      },
      expected: { allowed: false, status: 403, code: 'FORBIDDEN' },
    },
    {
      name: 'resource owner mismatch',
      input: {
        principal: member,
        accountStatus: 'active' as const,
        resourceOwnerId: 'user-2',
      },
      expected: { allowed: false, status: 403, code: 'OWNERSHIP_DENIED' },
    },
    {
      name: 'missing resources',
      input: { principal: member, accountStatus: 'active' as const, resourceOwnerId: null },
      expected: { allowed: false, status: 404, code: 'NOT_FOUND' },
    },
    {
      name: 'disabled feature gates',
      input: { principal: member, accountStatus: 'active' as const, gateEnabled: false },
      expected: { allowed: false, status: 403, code: 'GATE_DISABLED' },
    },
    {
      name: 'rate limit exhaustion',
      input: { principal: member, accountStatus: 'active' as const, rateLimitAllowed: false },
      expected: { allowed: false, status: 429, code: 'RATE_LIMITED' },
    },
    {
      name: 'authorized requests',
      input: {
        principal: member,
        accountStatus: 'active' as const,
        ageLevel: 'L2' as const,
        minimumAgeLevel: 'L2' as const,
        resourceOwnerId: 'user-1',
        gateEnabled: true,
        rateLimitAllowed: true,
      },
      expected: { allowed: true },
    },
  ] as const;

  it.each(cases)('[P1-03] denies or permits $name', ({ input, expected }) => {
    expect(evaluateAuthorization(input)).toEqual(expected);
  });

  it('[P1-03] enforces fixed-window rate limits and resets after the window', async () => {
    let now = 1_000;
    const store = new MemoryRateLimitStore(() => now);
    const policy = { name: 'auth', limit: 2, windowMs: 60_000, keyBy: 'ip' as const };

    expect(await store.consume(policy, 'ip:127.0.0.1')).toMatchObject({ allowed: true });
    expect(await store.consume(policy, 'ip:127.0.0.1')).toMatchObject({ allowed: true });
    expect(await store.consume(policy, 'ip:127.0.0.1')).toMatchObject({ allowed: false });
    expect(await store.consume(policy, 'ip:127.0.0.2')).toMatchObject({ allowed: true });
    now += 60_001;
    expect(await store.consume(policy, 'ip:127.0.0.1')).toMatchObject({ allowed: true });
  });
});

function executionContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function routeHandler() {},
    getClass: () => class RouteController {},
  } as never;
}

function reflectMetadata<T>(metadata: T) {
  return { getAllAndOverride: () => metadata } as never;
}

describe('P1-03 guard behavior', () => {
  it('[P1-03] AuthGuard rejects anonymous requests and attaches verified claims', async () => {
    const authService = {
      verifyAccessToken: vi
        .fn()
        .mockResolvedValue({ sub: 'user-1', roles: ['member'], mfa: false }),
    };
    const guard = new AuthGuard(authService as unknown as AuthService);
    const anonymous = { headers: {} };
    await expect(guard.canActivate(executionContext(anonymous))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const authenticated = { headers: { authorization: 'Bearer valid-token' } };
    await expect(guard.canActivate(executionContext(authenticated))).resolves.toBe(true);
    expect(authenticated).toHaveProperty('auth.sub', 'user-1');
  });

  it('[P1-03] AccountStatusGuard rejects inactive accounts before policy evaluation', async () => {
    const authStore = {
      getUserAuthState: vi.fn().mockResolvedValue({ accountStatus: 'suspended' }),
    };
    const guard = new AccountStatusGuard(authStore as unknown as AuthStore);
    await expect(
      guard.canActivate(executionContext({ auth: { sub: 'user-1' } })),
    ).rejects.toMatchObject({ status: 403, response: { code: 'ACCOUNT_INACTIVE' } });
  });

  it('[P1-03] AgeLevelGuard denies below-minimum age and permits sufficient age', () => {
    const guard = new AgeLevelGuard(reflectMetadata('L2'));
    const below = { auth: { sub: 'user-1' }, policyUser: { ageLevel: 'L1' } };
    expect(() => guard.canActivate(executionContext(below))).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        executionContext({
          auth: { sub: 'user-1' },
          policyUser: { ageLevel: 'L2' },
        }),
      ),
    ).not.toThrow();
    expect(RequiredAge).toBeDefined();
  });

  it('[P1-03] RoleGuard enforces roles and privileged MFA', () => {
    const guard = new RoleGuard(reflectMetadata(['creator']));
    const request = {
      auth: { sub: 'user-1', mfa: false },
      policyUser: { roles: ['member'], totpEnabled: false },
    };
    expect(() => guard.canActivate(executionContext(request))).toThrow(ForbiddenException);

    const privilegedGuard = new RoleGuard(reflectMetadata(['finance_admin']));
    expect(() =>
      privilegedGuard.canActivate(
        executionContext({
          auth: { sub: 'staff-1', mfa: false },
          policyUser: { roles: ['finance_admin'], totpEnabled: true },
        }),
      ),
    ).toThrowError(expect.objectContaining({ response: { code: 'TWO_FACTOR_REQUIRED' } }));
    expect(RequiredRoles).toBeDefined();
  });

  it('[P1-03] OwnershipPolicyGuard distinguishes missing resources from foreign ownership', async () => {
    const policy = { resourceType: 'profile', idParam: 'id' };
    const resolver = { resolveOwnerId: vi.fn().mockResolvedValue('user-2') };
    const guard = new OwnershipPolicyGuard(reflectMetadata(policy), resolver);
    const request = { auth: { sub: 'user-1' }, policyUser: { id: 'user-1' } };
    await expect(guard.canActivate(executionContext(request))).rejects.toMatchObject({
      status: 403,
      response: { code: 'OWNERSHIP_DENIED' },
    });
    resolver.resolveOwnerId.mockResolvedValue(null);
    await expect(guard.canActivate(executionContext(request))).rejects.toMatchObject({
      status: 404,
      response: { code: 'NOT_FOUND' },
    });
    expect(RequiredOwnership).toBeDefined();
    expect(OWNERSHIP_RESOLVER).toBeDefined();
  });

  it('[P1-03] FeatureGateGuard fails closed when a compliance gate is off', () => {
    const guard = new FeatureGateGuard(
      reflectMetadata('GATE:RANDOM_VIDEO'),
      new FeatureFlagsService(),
    );
    expect(() => guard.canActivate(executionContext({}))).toThrowError(
      expect.objectContaining({ response: { code: 'GATE_DISABLED' } }),
    );
    expect(RequiredFeatureGate).toBeDefined();
  });

  it('[P1-03] RateLimitGuard fails closed on backend errors and identifies throttled requests', async () => {
    const policy = { name: 'otp', limit: 3, windowMs: 600_000, keyBy: 'identity' as const };
    const request = {
      body: { identity: ' A@EXAMPLE.COM ' },
      socket: { remoteAddress: '127.0.0.1' },
    };
    const limitedStore = {
      consume: vi.fn().mockResolvedValue({ allowed: false, retryAfterMs: 1000 }),
    };
    const guard = new RateLimitGuard(reflectMetadata(policy), limitedStore);
    await expect(guard.canActivate(executionContext(request))).rejects.toMatchObject({
      status: 429,
      response: { code: 'RATE_LIMITED' },
    });
    expect(limitedStore.consume).toHaveBeenCalledWith(policy, 'identity:a@example.com');

    const unavailable = new RateLimitGuard(reflectMetadata(policy), {
      consume: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    });
    await expect(unavailable.canActivate(executionContext(request))).rejects.toMatchObject({
      status: 503,
      response: { code: 'RATE_LIMIT_UNAVAILABLE' },
    });
    expect(RateLimit).toBeDefined();
  });
});
