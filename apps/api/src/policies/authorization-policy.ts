import type { AgeLevel, Role } from '@posha/shared';

const AGE_LEVEL_ORDER: Record<AgeLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };

export interface AuthorizationInput {
  principal: { sub: string; roles: readonly Role[] } | null;
  accountStatus?: 'active' | 'suspended' | 'banned' | 'deleted';
  ageLevel?: AgeLevel;
  minimumAgeLevel?: AgeLevel;
  anyRole?: readonly Role[];
  resourceOwnerId?: string | null;
  gateEnabled?: boolean;
  rateLimitAllowed?: boolean;
}

export interface AuthorizationDecision {
  allowed: boolean;
  status?: 401 | 403 | 404 | 429;
  code?: string;
}

export function evaluateAuthorization(input: AuthorizationInput): AuthorizationDecision {
  if (!input.principal) return { allowed: false, status: 401, code: 'UNAUTHORIZED' };
  const principal = input.principal;
  if (input.accountStatus !== 'active') {
    return { allowed: false, status: 403, code: 'ACCOUNT_INACTIVE' };
  }
  if (
    input.minimumAgeLevel &&
    (!input.ageLevel || AGE_LEVEL_ORDER[input.ageLevel] < AGE_LEVEL_ORDER[input.minimumAgeLevel])
  ) {
    return { allowed: false, status: 403, code: 'AGE_LEVEL_REQUIRED' };
  }
  if (input.anyRole?.length && !input.anyRole.some((role) => principal.roles.includes(role))) {
    return { allowed: false, status: 403, code: 'FORBIDDEN' };
  }
  if (input.resourceOwnerId !== undefined && input.resourceOwnerId !== principal.sub) {
    return {
      allowed: false,
      status: input.resourceOwnerId === null ? 404 : 403,
      code: input.resourceOwnerId === null ? 'NOT_FOUND' : 'OWNERSHIP_DENIED',
    };
  }
  if (input.gateEnabled === false) return { allowed: false, status: 403, code: 'GATE_DISABLED' };
  if (input.rateLimitAllowed === false)
    return { allowed: false, status: 429, code: 'RATE_LIMITED' };
  return { allowed: true };
}
