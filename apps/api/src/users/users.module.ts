import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { AuthStore } from '../auth/auth-store.js';
import type { AuthService } from '../auth/auth.service.js';
import { FeatureFlagsService } from '../flags/feature-flags.service.js';
import type { OwnershipResolver } from '../policies/policy.guards.js';
import type { RateLimitStore } from '../policies/rate-limit.store.js';
import { PolicyModule } from '../policies/policy.module.js';
import { USERS_STORE } from './users-store.js';
import type { UsersStore } from './users-store.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

export interface UsersModuleOptions {
  store: UsersStore;
  authService: AuthService;
  authStore: AuthStore;
  featureFlags: FeatureFlagsService;
  rateLimitStore: RateLimitStore;
  ownershipResolver: OwnershipResolver;
}

@Module({})
export class UsersModule {
  static register(options: UsersModuleOptions): DynamicModule {
    return {
      module: UsersModule,
      imports: [
        PolicyModule.register({
          authService: options.authService,
          authStore: options.authStore,
          featureFlags: options.featureFlags,
          rateLimitStore: options.rateLimitStore,
          ownershipResolver: options.ownershipResolver,
        }),
      ],
      controllers: [UsersController],
      providers: [
        { provide: USERS_STORE, useValue: options.store },
        {
          provide: UsersService,
          useFactory: (store: UsersStore) => new UsersService(store),
          inject: [USERS_STORE],
        },
      ],
      exports: [UsersService],
    };
  }
}
