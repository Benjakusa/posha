import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AuthStore } from '../auth/auth-store.js';
import type { AuthService } from '../auth/auth.service.js';
import { FeatureFlagsService } from '../flags/feature-flags.service.js';
import type { OwnershipResolver } from '../policies/policy.guards.js';
import type { RateLimitStore } from '../policies/rate-limit.store.js';
import { PolicyModule } from '../policies/policy.module.js';
import { NOTIFICATION_STORE } from './notification-store.js';
import type { NotificationStore } from './notification-store.js';
import type { NotificationProvider } from './notification-provider.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notification.service.js';
import { PostgresNotificationStore } from './postgres-notification.store.js';

export const NOTIFICATION_PROVIDERS = Symbol('NOTIFICATION_PROVIDERS');

export interface NotificationsModuleOptions {
  pool: Pool;
  providers: readonly NotificationProvider[];
  authService: AuthService;
  authStore: AuthStore;
  featureFlags: FeatureFlagsService;
  rateLimitStore: RateLimitStore;
  ownershipResolver: OwnershipResolver;
  store?: NotificationStore;
}

@Module({})
export class NotificationsModule {
  static register(options: NotificationsModuleOptions): DynamicModule {
    return {
      module: NotificationsModule,
      imports: [
        PolicyModule.register({
          authService: options.authService,
          authStore: options.authStore,
          featureFlags: options.featureFlags,
          rateLimitStore: options.rateLimitStore,
          ownershipResolver: options.ownershipResolver,
        }),
      ],
      controllers: [NotificationsController],
      providers: [
        {
          provide: NOTIFICATION_STORE,
          useValue: options.store ?? new PostgresNotificationStore(options.pool),
        },
        { provide: NOTIFICATION_PROVIDERS, useValue: options.providers },
        {
          provide: NotificationsService,
          useFactory: (store: NotificationStore, providers: readonly NotificationProvider[]) =>
            new NotificationsService(store, providers),
          inject: [NOTIFICATION_STORE, NOTIFICATION_PROVIDERS],
        },
      ],
      exports: [NotificationsService],
    };
  }
}
