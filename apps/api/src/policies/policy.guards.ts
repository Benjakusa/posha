import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCodes } from '@posha/shared';
import type { AgeLevel } from '@posha/shared';
import { AuthService } from '../auth/auth.service.js';
import type { AuthAccessClaims } from '../auth/auth.service.js';
import { FeatureFlagsService } from '../flags/feature-flags.service.js';
import type { AuthStore } from '../auth/auth-store.js';
import { AUTH_STORE } from '../auth/auth-store.js';
import {
  RateLimit,
  RequiredAge,
  RequiredFeatureGate,
  RequiredOwnership,
  RequiredRoles,
} from './policy-metadata.js';
import type { OwnershipPolicyOptions } from './policy-metadata.js';
import { RATE_LIMIT_STORE } from './rate-limit.store.js';
import type { RateLimitStore } from './rate-limit.store.js';

export const OWNERSHIP_RESOLVER = Symbol('OWNERSHIP_RESOLVER');

export interface PolicyUserContext {
  id: string;
  roles: readonly string[];
  accountStatus: 'active' | 'suspended' | 'banned' | 'deleted';
  ageLevel: AgeLevel;
  totpEnabled: boolean;
}

export interface GuardRequest {
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  params?: Record<string, string | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  auth?: AuthAccessClaims;
  policyUser?: PolicyUserContext;
}

export interface OwnershipResolver {
  resolveOwnerId(policy: OwnershipPolicyOptions, request: GuardRequest): Promise<string | null>;
}

function codedException(status: number, code: string): HttpException {
  if (status === 401) return new UnauthorizedException({ code });
  if (status === 404) return new NotFoundException({ code });
  if (status === 429) return new HttpException({ code }, 429);
  return new ForbiddenException({ code });
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardRequest>();
    const header = request.headers?.authorization ?? request.headers?.Authorization;
    const authorization = Array.isArray(header) ? null : header;
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) throw codedException(401, ErrorCodes.UNAUTHORIZED);
    try {
      request.auth = await this.authService.verifyAccessToken(match[1]!);
      return true;
    } catch {
      throw codedException(401, ErrorCodes.UNAUTHORIZED);
    }
  }
}

@Injectable()
export class AccountStatusGuard implements CanActivate {
  constructor(@Inject(AUTH_STORE) private readonly authStore: AuthStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardRequest>();
    if (!request.auth) throw codedException(401, ErrorCodes.UNAUTHORIZED);
    const user = await this.authStore.getUserAuthState(request.auth.sub);
    if (!user) throw codedException(401, ErrorCodes.UNAUTHORIZED);
    if (user.accountStatus !== 'active') {
      throw codedException(403, ErrorCodes.ACCOUNT_INACTIVE);
    }
    request.policyUser = {
      id: request.auth.sub,
      roles: user.roles,
      accountStatus: user.accountStatus,
      ageLevel: user.ageLevel,
      totpEnabled: user.totpEnabled,
    };
    return true;
  }
}

@Injectable()
export class AgeLevelGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride(RequiredAge, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const request = context.switchToHttp().getRequest<GuardRequest>();
    if (!request.auth || !request.policyUser) throw codedException(401, ErrorCodes.UNAUTHORIZED);
    const order: Record<AgeLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };
    if (order[request.policyUser.ageLevel] < order[required]) {
      throw codedException(403, ErrorCodes.AGE_LEVEL_REQUIRED);
    }
    return true;
  }
}

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride(RequiredRoles, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<GuardRequest>();
    if (!request.auth || !request.policyUser) throw codedException(401, ErrorCodes.UNAUTHORIZED);
    if (!required.some((role) => request.policyUser!.roles.includes(role))) {
      throw codedException(403, ErrorCodes.FORBIDDEN);
    }
    const privileged = request.policyUser.roles.some((role) =>
      [
        'creator',
        'moderator',
        'finance_admin',
        'support_agent',
        'compliance_officer',
        'super_admin',
      ].includes(role),
    );
    if (privileged && (!request.policyUser.totpEnabled || !request.auth.mfa)) {
      throw codedException(403, ErrorCodes.TWO_FACTOR_REQUIRED);
    }
    return true;
  }
}

@Injectable()
export class OwnershipPolicyGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(OWNERSHIP_RESOLVER) private readonly resolver: OwnershipResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride(RequiredOwnership, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!policy) return true;
    const request = context.switchToHttp().getRequest<GuardRequest>();
    if (!request.auth || !request.policyUser) throw codedException(401, ErrorCodes.UNAUTHORIZED);
    const ownerId = await this.resolver.resolveOwnerId(policy, request);
    if (ownerId === null) throw codedException(404, ErrorCodes.NOT_FOUND);
    if (ownerId !== request.auth.sub) throw codedException(403, ErrorCodes.OWNERSHIP_DENIED);
    return true;
  }
}

@Injectable()
export class FeatureGateGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const gate = this.reflector.getAllAndOverride(RequiredFeatureGate, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!gate) return true;
    if (!this.featureFlags.isEnabled(gate)) throw codedException(403, ErrorCodes.GATE_DISABLED);
    return true;
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RATE_LIMIT_STORE) private readonly rateLimitStore: RateLimitStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride(RateLimit, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!policy) return true;
    if (
      !Number.isSafeInteger(policy.limit) ||
      policy.limit < 1 ||
      !Number.isSafeInteger(policy.windowMs) ||
      policy.windowMs < 1
    ) {
      throw new ServiceUnavailableException({ code: ErrorCodes.RATE_LIMIT_UNAVAILABLE });
    }
    const request = context.switchToHttp().getRequest<GuardRequest>();
    const identity = this.identityFor(policy.keyBy, request);
    let result;
    try {
      result = await this.rateLimitStore.consume(policy, identity);
    } catch {
      throw new ServiceUnavailableException({ code: ErrorCodes.RATE_LIMIT_UNAVAILABLE });
    }
    if (!result.allowed) throw codedException(429, ErrorCodes.RATE_LIMITED);
    return true;
  }

  private identityFor(keyBy: 'ip' | 'identity' | 'principal', request: GuardRequest): string {
    if (keyBy === 'principal' && request.auth) return `user:${request.auth.sub}`;
    if (keyBy === 'identity') {
      const identity = request.body?.identity ?? request.body?.email ?? request.body?.phone;
      if (typeof identity === 'string' && identity.trim())
        return `identity:${identity.trim().toLowerCase()}`;
    }
    return `ip:${request.socket?.remoteAddress ?? request.ip ?? 'unknown'}`;
  }
}
