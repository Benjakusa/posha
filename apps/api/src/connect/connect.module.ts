import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { Pool } from 'pg';
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
import { MATCHING_STORE, RECENT_SKIP_STORE } from './matching-store.js';
import type { MatchingStore, RecentSkipStore } from './matching-store.js';
import { CONNECT_SESSION_STORE } from './connect-session.store.js';
import type { ConnectSessionStore } from './connect-session.store.js';
import { USERS_STORE } from '../users/users-store.js';
import type { UsersStore } from '../users/users-store.js';
import type { OwnershipResolver } from '../policies/policy.guards.js';
import { PolicyModule } from '../policies/policy.module.js';
import { CONNECT_MATCH_EVENTS, ConnectSocketMatchEvents } from './connect-match-events.js';
import { CHAT_ALIAS_RESOLVER } from './connect-matchmaker.js';
import type { ChatAliasResolver } from './connect-matchmaker.js';
import { ConnectMatchmaker } from './connect-matchmaker.js';
import { ConnectMatcherWorker } from './connect-matcher.worker.js';
import { ConnectRetentionWorker } from './connect-retention.worker.js';
import {
  CONNECT_MESSAGE_CIPHER,
  CONNECT_MESSAGE_STORE,
  CONNECT_MODERATION_PROVIDER,
} from './connect-message.service.js';
import type {
  ConnectMessageCipher,
  ConnectMessageStore,
  ModerationProvider,
} from './connect-message.service.js';
import { ConnectMessageService } from './connect-message.service.js';
import { ConnectGateway } from './connect.gateway.js';
import { ConnectSafetyController } from './connect-safety.controller.js';
import { ConnectSafetyService } from './connect-safety.service.js';
import { ConnectMetricsController } from './connect-metrics.controller.js';
import { ConnectObservabilityService } from './connect-observability.service.js';
import { ConnectMetricsGuard } from './connect-metrics.guard.js';
import { ConnectVideoTokenController } from './connect-video-token.controller.js';
import {
  CONNECT_VIDEO_CONSENT_SERVICE,
  ConnectVideoConsentService,
  ConnectVideoTokenService,
  SessionVideoConsentVerifier,
  VIDEO_CONSENT_VERIFIER,
} from './connect-video-token.service.js';
import type { VideoConsentVerifier } from './connect-video-token.service.js';
import { LiveKitSfuProvider, SFU_PROVIDER } from './connect-sfu.provider.js';
import type { SfuProvider } from './connect-sfu.provider.js';
import { CONNECT_CHAT_ABUSE_STORE } from './connect-chat-abuse.store.js';
import type { ConnectChatAbuseStore } from './connect-chat-abuse.store.js';
import {
  CONNECT_VIDEO_FRAME_CLASSIFIER,
  CONNECT_VIDEO_MODERATION_SERVICE,
  CONNECT_VIDEO_MODERATION_STORE,
  ConnectVideoModerationService,
  PostgresConnectVideoModerationStore,
  UnavailableConnectVideoFrameClassifier,
} from './connect-video-moderation.service.js';
import type {
  ConnectVideoFrameClassifier,
  ConnectVideoModerationStore,
} from './connect-video-moderation.service.js';
const CONNECT_POOL = Symbol('CONNECT_POOL');

export interface ConnectModuleOptions {
  pool: Pool;
  ownershipResolver: OwnershipResolver;
  authService: AuthService;
  authStore: AuthStore;
  featureFlags: FeatureFlagsService;
  rateLimitStore: RateLimitStore;
  presenceStore: ConnectPresenceStore;
  matchingStore: MatchingStore;
  recentSkipStore: RecentSkipStore;
  usersStore: UsersStore;
  sessionStore: ConnectSessionStore;
  aliasResolver: ChatAliasResolver;
  messageStore: ConnectMessageStore;
  messageCipher: ConnectMessageCipher;
  moderationProvider: ModerationProvider;
  chatAbuseStore: ConnectChatAbuseStore;
  sfuProvider?: SfuProvider;
  videoConsentVerifier?: VideoConsentVerifier;
  videoFrameClassifier?: ConnectVideoFrameClassifier;
  videoModerationStore?: ConnectVideoModerationStore;
}

@Module({})
export class ConnectModule {
  static register(options: ConnectModuleOptions): DynamicModule {
    return {
      module: ConnectModule,
      imports: [
        PolicyModule.register({
          authService: options.authService,
          authStore: options.authStore,
          featureFlags: options.featureFlags,
          rateLimitStore: options.rateLimitStore,
          ownershipResolver: options.ownershipResolver,
        }),
      ],
      controllers: [ConnectSafetyController, ConnectMetricsController, ConnectVideoTokenController],
      providers: [
        { provide: AuthService, useValue: options.authService },
        { provide: AUTH_STORE, useValue: options.authStore },
        { provide: FeatureFlagsService, useValue: options.featureFlags },
        { provide: RATE_LIMIT_STORE, useValue: options.rateLimitStore },
        { provide: CONNECT_PRESENCE_STORE, useValue: options.presenceStore },
        { provide: MATCHING_STORE, useValue: options.matchingStore },
        { provide: RECENT_SKIP_STORE, useValue: options.recentSkipStore },
        { provide: USERS_STORE, useValue: options.usersStore },
        { provide: CONNECT_SESSION_STORE, useValue: options.sessionStore },
        { provide: CHAT_ALIAS_RESOLVER, useValue: options.aliasResolver },
        { provide: CONNECT_MESSAGE_STORE, useValue: options.messageStore },
        { provide: CONNECT_MESSAGE_CIPHER, useValue: options.messageCipher },
        { provide: CONNECT_MODERATION_PROVIDER, useValue: options.moderationProvider },
        { provide: CONNECT_CHAT_ABUSE_STORE, useValue: options.chatAbuseStore },
        {
          provide: CONNECT_VIDEO_FRAME_CLASSIFIER,
          useValue: options.videoFrameClassifier ?? new UnavailableConnectVideoFrameClassifier(),
        },
        {
          provide: CONNECT_VIDEO_MODERATION_STORE,
          useValue:
            options.videoModerationStore ?? new PostgresConnectVideoModerationStore(options.pool),
        },
        ConnectObservabilityService,
        ConnectMetricsGuard,
        { provide: SFU_PROVIDER, useValue: options.sfuProvider ?? new LiveKitSfuProvider() },
        {
          provide: VIDEO_CONSENT_VERIFIER,
          useFactory: (sessions: ConnectSessionStore) =>
            options.videoConsentVerifier ?? new SessionVideoConsentVerifier(sessions),
          inject: [CONNECT_SESSION_STORE],
        },
        {
          provide: CONNECT_VIDEO_CONSENT_SERVICE,
          useFactory: (sessions: ConnectSessionStore, featureFlags: FeatureFlagsService) =>
            new ConnectVideoConsentService(sessions, featureFlags),
          inject: [CONNECT_SESSION_STORE, FeatureFlagsService],
        },
        {
          provide: CONNECT_VIDEO_MODERATION_SERVICE,
          useFactory: (
            sessions: ConnectSessionStore,
            classifier: ConnectVideoFrameClassifier,
            moderation: ConnectVideoModerationStore,
            connect: ConnectRealtimePort,
            featureFlags: FeatureFlagsService,
          ) =>
            new ConnectVideoModerationService(
              sessions,
              classifier,
              moderation,
              connect,
              featureFlags,
            ),
          inject: [
            CONNECT_SESSION_STORE,
            CONNECT_VIDEO_FRAME_CLASSIFIER,
            CONNECT_VIDEO_MODERATION_STORE,
            CONNECT_REALTIME_PORT,
            FeatureFlagsService,
          ],
        },
        {
          provide: ConnectVideoTokenService,
          useFactory: (
            sessions: ConnectSessionStore,
            sfu: SfuProvider,
            consent: VideoConsentVerifier,
            featureFlags: FeatureFlagsService,
          ) =>
            new ConnectVideoTokenService(sessions, sfu, consent, featureFlags, undefined, () =>
              Boolean(options.videoFrameClassifier),
            ),
          inject: [
            CONNECT_SESSION_STORE,
            SFU_PROVIDER,
            VIDEO_CONSENT_VERIFIER,
            FeatureFlagsService,
          ],
        },
        {
          provide: ConnectSafetyService,
          useFactory: (
            pool: Pool,
            sessions: ConnectSessionStore,
            messages: ConnectMessageStore,
            cipher: ConnectMessageCipher,
            users: UsersStore,
            matchmaker: ConnectMatchmaker,
            metrics: ConnectObservabilityService,
          ) =>
            new ConnectSafetyService(
              pool,
              sessions,
              messages,
              cipher,
              users,
              matchmaker,
              undefined,
              undefined,
              metrics,
            ),
          inject: [
            CONNECT_POOL,
            CONNECT_SESSION_STORE,
            CONNECT_MESSAGE_STORE,
            CONNECT_MESSAGE_CIPHER,
            USERS_STORE,
            ConnectMatchmaker,
            ConnectObservabilityService,
          ],
        },
        { provide: CONNECT_POOL, useValue: options.pool },
        {
          provide: ConnectMessageService,
          useFactory: (
            store: ConnectMessageStore,
            cipher: ConnectMessageCipher,
            moderation: ModerationProvider,
          ) => new ConnectMessageService(store, cipher, moderation),
          inject: [CONNECT_MESSAGE_STORE, CONNECT_MESSAGE_CIPHER, CONNECT_MODERATION_PROVIDER],
        },
        ConnectSocketMatchEvents,
        { provide: CONNECT_MATCH_EVENTS, useExisting: ConnectSocketMatchEvents },
        {
          provide: ConnectMatchmaker,
          useFactory: (
            matching: MatchingStore,
            skips: RecentSkipStore,
            users: UsersStore,
            auth: AuthStore,
            presence: ConnectPresenceStore,
            sessions: ConnectSessionStore,
            aliases: ChatAliasResolver,
            events: ConnectSocketMatchEvents,
            messages: ConnectMessageService,
            metrics: ConnectObservabilityService,
          ) =>
            new ConnectMatchmaker(
              matching,
              skips,
              users,
              auth,
              presence,
              sessions,
              aliases,
              events,
              undefined,
              undefined,
              messages,
              metrics,
              () => options.featureFlags.isEnabled('GATE:RANDOM_VIDEO'),
            ),
          inject: [
            MATCHING_STORE,
            RECENT_SKIP_STORE,
            USERS_STORE,
            AUTH_STORE,
            CONNECT_PRESENCE_STORE,
            CONNECT_SESSION_STORE,
            CHAT_ALIAS_RESOLVER,
            CONNECT_MATCH_EVENTS,
            ConnectMessageService,
            ConnectObservabilityService,
          ],
        },
        { provide: CONNECT_REALTIME_PORT, useExisting: ConnectMatchmaker },
        {
          provide: ConnectMatcherWorker,
          useFactory: (matchmaker: ConnectMatchmaker) => new ConnectMatcherWorker(matchmaker),
          inject: [ConnectMatchmaker],
        },
        {
          provide: ConnectRetentionWorker,
          useFactory: (store: ConnectMessageStore) => new ConnectRetentionWorker(store),
          inject: [CONNECT_MESSAGE_STORE],
        },
        ConnectGateway,
      ],
      exports: [
        ConnectGateway,
        ConnectMatchmaker,
        ConnectMatcherWorker,
        ConnectRetentionWorker,
        ConnectObservabilityService,
      ],
    };
  }
}
