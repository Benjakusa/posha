import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { AuthStore } from '../auth/auth-store.js';
import { AUTH_STORE } from '../auth/auth-store.js';
import { AuthService } from '../auth/auth.service.js';
import { FeatureFlagsService } from '../flags/feature-flags.service.js';
import type { OwnershipResolver } from './policy.guards.js';
import {
  AccountStatusGuard,
  AgeLevelGuard,
  AuthGuard,
  FeatureGateGuard,
  OWNERSHIP_RESOLVER,
  OwnershipPolicyGuard,
  RateLimitGuard,
  RoleGuard,
} from './policy.guards.js';
import type { RateLimitStore } from './rate-limit.store.js';
import { RATE_LIMIT_STORE } from './rate-limit.store.js';

export interface PolicyModuleOptions {
  authService: AuthService;
  authStore: AuthStore;
  featureFlags: FeatureFlagsService;
  rateLimitStore: RateLimitStore;
  ownershipResolver: OwnershipResolver;
}

@Module({})
export class PolicyModule {
  static register(options: PolicyModuleOptions): DynamicModule {
    return {
      module: PolicyModule,
      providers: [
        { provide: AUTH_STORE, useValue: options.authStore },
        { provide: AuthService, useValue: options.authService },
        { provide: FeatureFlagsService, useValue: options.featureFlags },
        { provide: RATE_LIMIT_STORE, useValue: options.rateLimitStore },
        { provide: OWNERSHIP_RESOLVER, useValue: options.ownershipResolver },
        AuthGuard,
        AccountStatusGuard,
        AgeLevelGuard,
        RoleGuard,
        OwnershipPolicyGuard,
        FeatureGateGuard,
        RateLimitGuard,
      ],
      exports: [
        AuthGuard,
        AccountStatusGuard,
        AgeLevelGuard,
        RoleGuard,
        OwnershipPolicyGuard,
        FeatureGateGuard,
        RateLimitGuard,
      ],
    };
  }
}
