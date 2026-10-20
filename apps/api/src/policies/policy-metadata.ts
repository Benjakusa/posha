import { Reflector } from '@nestjs/core';
import type { AgeLevel, Role } from '@posha/shared';
import type { ComplianceGateKey } from '../flags/feature-flags.service.js';

export interface OwnershipPolicyOptions {
  resourceType: string;
  idParam: string;
}

export interface RateLimitPolicyOptions {
  name: string;
  limit: number;
  windowMs: number;
  keyBy: 'ip' | 'identity' | 'principal';
}

export const RequiredAge = Reflector.createDecorator<AgeLevel>();
export const RequiredRoles = Reflector.createDecorator<readonly Role[]>();
export const RequiredFeatureGate = Reflector.createDecorator<ComplianceGateKey>();
export const RequiredOwnership = Reflector.createDecorator<OwnershipPolicyOptions>();
export const RateLimit = Reflector.createDecorator<RateLimitPolicyOptions>();
