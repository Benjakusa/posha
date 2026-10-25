import { randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { Pool } from 'pg';
import { API_CONFIG, validateApiConfig } from './api-config.js';
import { HealthController } from './health/health.controller.js';
import { HealthProbeGuard } from './health/health-probe.guard.js';
import {
  FeatureFlagsService,
  createDefaultComplianceGates,
  createDefaultFeatureFlags,
} from './flags/feature-flags.service.js';
import { AuthModule } from './auth/auth.module.js';
import { PostgresAuthStore } from './auth/postgres-auth.store.js';
import { validateAuthConfig } from './auth/auth-config.js';
import { MemoryAuthStore } from './memory-auth.store.js';
import { ConsoleNotificationProvider } from './auth/console-notification.provider.js';
import { AgeModule } from './age/age.module.js';
import { MemoryAgeStore } from './age/memory-age.store.js';
import { PostgresAgeAssuranceStore } from './age/postgres-age.store.js';
import { FakeAgeAssuranceProvider } from './age/age-provider.js';
import { UsersModule } from './users/users.module.js';
import { MemoryUsersStore } from './users/memory-users.store.js';
import { PostgresUsersStore } from './users/postgres-users.store.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { MemoryNotificationStore } from './notifications/memory-notification.store.js';
import { PostgresNotificationStore } from './notifications/postgres-notification.store.js';
import { FakeNotificationProvider } from './notifications/notification-provider.js';
import { ConnectModule } from './connect/connect.module.js';
import { MemoryConnectPresenceStore } from './connect/connect-presence.store.js';
import { MemoryMatchingStore, MemoryRecentSkipStore } from './connect/matching-store.js';
import {
  MemoryConnectSessionStore,
  PostgresConnectSessionStore,
} from './connect/connect-session.store.js';
import {
  MemoryConnectMessageStore,
  PostgresConnectMessageStore,
  AesGcmConnectMessageCipher,
  KeywordModerationProvider,
} from './connect/connect-message.service.js';
import { MemoryConnectChatAbuseStore } from './connect/connect-chat-abuse.store.js';
import { MemoryConnectVideoModerationStore } from './connect/connect-video-moderation.service.js';
import { PostgresChatAliasResolver } from './connect/connect-matchmaker.js';
import { AuthService } from './auth/auth.service.js';
import { MemoryRateLimitStore } from './policies/rate-limit.store.js';
import { InMemoryOwnershipResolver } from './policies/ownership-resolver.impl.js';
import { createPinoHttpOptions } from './logging.js';
import { GuestModule } from './guest/guest.module.js';
import { GuestSessionService, MemoryGuestSessionStore } from './guest/guest-session.service.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { MemoryCatalogStore, PostgresCatalogStore } from './catalog/catalog.store.js';

const config = validateApiConfig();
const ephemeralSecret = (key: string): string => {
  const existing = process.env[key];
  if (existing) return existing;
  if (config.NODE_ENV === 'production') throw new Error(`Missing required configuration: ${key}`);
  return randomBytes(key === 'AUTH_TOTP_ENCRYPTION_KEY' ? 32 : 48).toString('base64');
};
const authEnvironment = {
  ...process.env,
  AUTH_ACCESS_TOKEN_SECRET:
    process.env.AUTH_ACCESS_TOKEN_SECRET ?? ephemeralSecret('AUTH_ACCESS_TOKEN_SECRET'),
  AUTH_OTP_PEPPER: process.env.AUTH_OTP_PEPPER ?? ephemeralSecret('AUTH_OTP_PEPPER'),
  AUTH_TOTP_ENCRYPTION_KEY: ephemeralSecret('AUTH_TOTP_ENCRYPTION_KEY'),
};
const authConfig = validateAuthConfig(authEnvironment);
const guestAccessEnabled = config.NODE_ENV !== 'production';
const flags = new FeatureFlagsService(
  createDefaultFeatureFlags().map((flag) =>
    flag.key === 'GATE:GUEST_ACCESS' ? { ...flag, enabled: guestAccessEnabled } : flag,
  ),
  createDefaultComplianceGates().map((gate) =>
    gate.key === 'GATE:GUEST_ACCESS' && guestAccessEnabled
      ? {
          ...gate,
          status: 'approved' as const,
          approvedBy: 'local-development',
          evidenceRef: 'local-development-only',
          approvedAt: new Date('2026-10-23T00:00:00.000Z'),
        }
      : gate,
  ),
);
const rateLimitStore = new MemoryRateLimitStore();
const ownershipResolver = new InMemoryOwnershipResolver();
const pool = (process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : {
      query: async () => {
        throw new Error('DATABASE_URL is required for this operation');
      },
      connect: async () => {
        throw new Error('DATABASE_URL is required for this operation');
      },
      end: async () => undefined,
    }) as unknown as Pool;
const authStore = process.env.DATABASE_URL ? new PostgresAuthStore(pool) : new MemoryAuthStore();
const authService = new AuthService(authStore, new ConsoleNotificationProvider(), authConfig);
const usersStore = process.env.DATABASE_URL ? new PostgresUsersStore(pool) : new MemoryUsersStore();
const connectSessions = process.env.DATABASE_URL
  ? new PostgresConnectSessionStore(pool)
  : new MemoryConnectSessionStore();
const connectMessages = process.env.DATABASE_URL
  ? new PostgresConnectMessageStore(pool)
  : new MemoryConnectMessageStore(connectSessions);
const guestSessionStore = new MemoryGuestSessionStore();
const guestSessions = new GuestSessionService(
  authService,
  flags,
  guestSessionStore,
  authConfig.otpPepper,
);
const chatAliasResolver = process.env.DATABASE_URL
  ? {
      getChatAlias: async (userId: string) =>
        (await guestSessions.aliasFor(userId)) ??
        (await new PostgresChatAliasResolver(pool).getChatAlias(userId)),
    }
  : { getChatAlias: async (userId: string) => guestSessions.aliasFor(userId) };

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: createPinoHttpOptions() }),
    AuthModule.register({
      pool,
      delivery: new ConsoleNotificationProvider(),
      config: authConfig,
      store: authStore,
    }),
    GuestModule.register({
      authService,
      featureFlags: flags,
      store: guestSessionStore,
      auditKey: authConfig.otpPepper,
    }),
    CatalogModule.register({
      store: process.env.DATABASE_URL ? new PostgresCatalogStore(pool) : new MemoryCatalogStore(),
      authService,
      guestSessions,
    }),
    AgeModule.register({
      store: process.env.DATABASE_URL ? new PostgresAgeAssuranceStore(pool) : new MemoryAgeStore(),
      provider: new FakeAgeAssuranceProvider(Buffer.from(authEnvironment.AUTH_OTP_PEPPER)),
      featureFlags: flags,
      environment: config.NODE_ENV,
      authService,
      authStore,
      rateLimitStore,
      ownershipResolver,
    }),
    UsersModule.register({
      store: usersStore,
      authService,
      authStore,
      featureFlags: flags,
      rateLimitStore,
      ownershipResolver,
    }),
    NotificationsModule.register({
      pool,
      providers: [new FakeNotificationProvider('email')],
      store: process.env.DATABASE_URL
        ? new PostgresNotificationStore(pool)
        : new MemoryNotificationStore(),
      authService,
      authStore,
      featureFlags: flags,
      rateLimitStore,
      ownershipResolver,
    }),
    ConnectModule.register({
      pool,
      ownershipResolver,
      authService,
      authStore,
      featureFlags: flags,
      rateLimitStore,
      presenceStore: new MemoryConnectPresenceStore(),
      matchingStore: new MemoryMatchingStore(),
      recentSkipStore: new MemoryRecentSkipStore(),
      usersStore,
      sessionStore: connectSessions,
      aliasResolver: chatAliasResolver,
      messageStore: connectMessages,
      messageCipher: new AesGcmConnectMessageCipher(
        Buffer.from(authEnvironment.AUTH_ACCESS_TOKEN_SECRET).subarray(0, 32),
      ),
      moderationProvider: new KeywordModerationProvider(),
      chatAbuseStore: new MemoryConnectChatAbuseStore(),
      videoModerationStore: new MemoryConnectVideoModerationStore(),
      guestSessionVerifier: guestSessions,
    }),
  ],
  controllers: [HealthController],
  providers: [HealthProbeGuard, { provide: API_CONFIG, useValue: config }],
})
export class AppModule {}
