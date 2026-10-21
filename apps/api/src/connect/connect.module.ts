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
import { MATCHING_STORE, RECENT_SKIP_STORE } from './matching-store.js';
import type { MatchingStore, RecentSkipStore } from './matching-store.js';
import { CONNECT_SESSION_STORE } from './connect-session.store.js';
import type { ConnectSessionStore } from './connect-session.store.js';
import { USERS_STORE } from '../users/users-store.js';
import type { UsersStore } from '../users/users-store.js';
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
import { CONNECT_CHAT_ABUSE_STORE } from './connect-chat-abuse.store.js';
import type { ConnectChatAbuseStore } from './connect-chat-abuse.store.js';

export interface ConnectModuleOptions {
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
      exports: [ConnectGateway, ConnectMatchmaker, ConnectMatcherWorker, ConnectRetentionWorker],
    };
  }
}
