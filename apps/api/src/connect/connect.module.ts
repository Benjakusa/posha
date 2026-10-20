import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { AuthStore } from '../auth/auth-store.js';
import { AUTH_STORE } from '../auth/auth-store.js';
import { AuthService } from '../auth/auth.service.js';
import { FeatureFlagsService } from '../flags/feature-flags.service.js';
import type { RateLimitStore } from '../policies/rate-limit.store.js';
import { RATE_LIMIT_STORE } from '../policies/rate-limit.store.js';
import { CONNECT_PRESENCE_STORE } from './connect-presence.store.js';
import type { ConnectPresenceStore } from './connect-presence.store.js';
import { CONNECT_REALTIME_PORT } from './connect-realtime.port.js';
import type { ConnectRealtimePort } from './connect-realtime.port.js';
import { ConnectGateway } from './connect.gateway.js';

export interface ConnectModuleOptions {
  authService: AuthService;
  authStore: AuthStore;
  featureFlags: FeatureFlagsService;
  rateLimitStore: RateLimitStore;
  presenceStore: ConnectPresenceStore;
  realtimePort: ConnectRealtimePort;
}

@Module({})
export class ConnectModule {
  static register(options: ConnectModuleOptions): DynamicModule {
    return {
      module: ConnectModule,
      providers: [
        { provide: AuthService, useValue: options.authService },
        { provide: AUTH_STORE, useValue: options.authStore },
        { provide: FeatureFlagsService, useValue: options.featureFlags },
        { provide: RATE_LIMIT_STORE, useValue: options.rateLimitStore },
        { provide: CONNECT_PRESENCE_STORE, useValue: options.presenceStore },
        { provide: CONNECT_REALTIME_PORT, useValue: options.realtimePort },
        ConnectGateway,
      ],
      exports: [ConnectGateway],
    };
  }
}
