import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AuthConfig } from './auth-config.js';
import { AUTH_CONFIG } from './auth-config.js';
import { AUTH_STORE } from './auth-store.js';
import type { AuthStore } from './auth-store.js';
import { AuthService, OTP_DELIVERY } from './auth.service.js';
import type { OtpDeliveryProvider } from './auth.service.js';
import { PostgresAuthStore } from './postgres-auth.store.js';
import { AuthController } from './auth.controller.js';

export interface AuthModuleOptions {
  pool: Pool;
  delivery: OtpDeliveryProvider;
  config: AuthConfig;
  store?: AuthStore;
}

@Module({ controllers: [AuthController] })
export class AuthModule {
  static register(options: AuthModuleOptions): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [
        { provide: AUTH_CONFIG, useValue: options.config },
        { provide: OTP_DELIVERY, useValue: options.delivery },
        {
          provide: AUTH_STORE,
          useValue: options.store ?? new PostgresAuthStore(options.pool),
        },
        {
          provide: AuthService,
          useFactory: (store: AuthStore, delivery: OtpDeliveryProvider, config: AuthConfig) =>
            new AuthService(store, delivery, config),
          inject: [AUTH_STORE, OTP_DELIVERY, AUTH_CONFIG],
        },
      ],
      exports: [AuthService],
    };
  }
}
