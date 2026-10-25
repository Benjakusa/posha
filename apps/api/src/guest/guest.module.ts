import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { FeatureFlagsService } from '../flags/feature-flags.service.js';
import { GuestSessionController } from './guest-session.controller.js';
import { GUEST_SESSION_STORE, GuestSessionService } from './guest-session.service.js';
import type { GuestSessionStore } from './guest-session.service.js';

export interface GuestModuleOptions {
  authService: AuthService;
  featureFlags: FeatureFlagsService;
  store: GuestSessionStore;
  auditKey: Buffer;
}

@Module({})
export class GuestModule {
  static register(options: GuestModuleOptions): DynamicModule {
    return {
      module: GuestModule,
      controllers: [GuestSessionController],
      providers: [
        { provide: AuthService, useValue: options.authService },
        { provide: FeatureFlagsService, useValue: options.featureFlags },
        { provide: GUEST_SESSION_STORE, useValue: options.store },
        {
          provide: GuestSessionService,
          useFactory: (auth: AuthService, flags: FeatureFlagsService, store: GuestSessionStore) =>
            new GuestSessionService(auth, flags, store, options.auditKey),
          inject: [AuthService, FeatureFlagsService, GUEST_SESSION_STORE],
        },
      ],
      exports: [GuestSessionService, GUEST_SESSION_STORE],
    };
  }
}
