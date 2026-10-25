import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { GuestSessionService } from '../guest/guest-session.service.js';
import { CatalogController } from './catalog.controller.js';
import { CATALOG_ENTITLEMENTS, CatalogService } from './catalog.service.js';
import type { CatalogEntitlements } from './catalog.service.js';
import { CATALOG_STORE, type CatalogStore as Store } from './catalog.store.js';

export interface CatalogModuleOptions {
  store: Store;
  authService: AuthService;
  guestSessions: GuestSessionService;
  entitlements?: CatalogEntitlements;
}

@Module({})
export class CatalogModule {
  static register(options: CatalogModuleOptions): DynamicModule {
    return {
      module: CatalogModule,
      controllers: [CatalogController],
      providers: [
        { provide: CATALOG_STORE, useValue: options.store },
        {
          provide: CATALOG_ENTITLEMENTS,
          useValue: options.entitlements ?? { canViewCreator: async () => false },
        },
        { provide: AuthService, useValue: options.authService },
        { provide: GuestSessionService, useValue: options.guestSessions },
        CatalogService,
      ],
      exports: [CatalogService],
    };
  }
}
