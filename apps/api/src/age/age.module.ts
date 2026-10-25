import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { AgeAssuranceProvider } from './age-provider.js';
import { AGE_ASSURANCE_PROVIDER } from './age-provider.js';
import type { AgeAssuranceStore } from './age-store.js';
import { AGE_ASSURANCE_STORE } from './age-store.js';
import { AgeController } from './age.controller.js';
import { AgeAssuranceService } from './age.service.js';
import { FeatureFlagsService } from '../flags/feature-flags.service.js';
import type { AuthStore } from '../auth/auth-store.js';
import type { AuthService } from '../auth/auth.service.js';
import type { RateLimitStore } from '../policies/rate-limit.store.js';
import type { OwnershipResolver } from '../policies/policy.guards.js';
import { PolicyModule } from '../policies/policy.module.js';

export interface AgeModuleOptions {
  store: AgeAssuranceStore;
  provider: AgeAssuranceProvider;
  featureFlags: FeatureFlagsService;
  environment: string;
  authService: AuthService;
  authStore: AuthStore;
  rateLimitStore: RateLimitStore;
  ownershipResolver: OwnershipResolver;
}

@Module({ controllers: [AgeController] })
export class AgeModule {
  static register(options: AgeModuleOptions): DynamicModule {
    return {
      module: AgeModule,
      controllers: [AgeController],
      imports: [
        PolicyModule.register({
          authService: options.authService,
          authStore: options.authStore,
          featureFlags: options.featureFlags,
          rateLimitStore: options.rateLimitStore,
          ownershipResolver: options.ownershipResolver,
        }),
      ],
      providers: [
        { provide: AGE_ASSURANCE_STORE, useValue: options.store },
        { provide: AGE_ASSURANCE_PROVIDER, useValue: options.provider },
        { provide: FeatureFlagsService, useValue: options.featureFlags },
        {
          provide: AgeAssuranceService,
          useFactory: (
            store: AgeAssuranceStore,
            provider: AgeAssuranceProvider,
            flags: FeatureFlagsService,
          ) => new AgeAssuranceService(store, provider, flags, options.environment),
          inject: [AGE_ASSURANCE_STORE, AGE_ASSURANCE_PROVIDER, FeatureFlagsService],
        },
      ],
      exports: [AgeAssuranceService],
    };
  }
}
