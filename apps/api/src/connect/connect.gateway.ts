import { Inject, Optional } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import {
  ConnectChatSendSchema,
  ConnectChatTypingSchema,
  ConnectHeartbeatSchema,
  ConnectQueueJoinSchema,
  ConnectQueueLeaveSchema,
  ConnectSessionSchema,
  ErrorCodes,
} from '@posha/shared';
import type { AuthStore } from '../auth/auth-store.js';
import { AUTH_STORE } from '../auth/auth-store.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthAccessClaims } from '../auth/auth.service.js';
import type { ZodType } from 'zod';
import { FeatureFlagsService } from '../flags/feature-flags.service.js';
import type { RateLimitStore } from '../policies/rate-limit.store.js';
import { RATE_LIMIT_STORE } from '../policies/rate-limit.store.js';
import { CONNECT_PRESENCE_STORE } from './connect-presence.store.js';
import type { ConnectPresenceStore } from './connect-presence.store.js';
import { CONNECT_MATCH_EVENTS } from './connect-match-events.js';
import {
  CONNECT_CHAT_ABUSE_STORE,
  MemoryConnectChatAbuseStore,
} from './connect-chat-abuse.store.js';
import type { ConnectChatAbuseStore } from './connect-chat-abuse.store.js';
import type { ConnectSocketMatchEvents } from './connect-match-events.js';
import { CONNECT_REALTIME_PORT, ConnectRealtimeError } from './connect-realtime.port.js';
import type { ConnectRealtimePort } from './connect-realtime.port.js';

interface SocketPrincipal {
  userId: string;
  accessToken: string;
  claims: AuthAccessClaims;
}

type ConnectSocket = Socket & { data: { principal?: SocketPrincipal } };

interface RealtimeRatePolicy {
  name: string;
  limit: number;
  windowMs: number;
  keyBy: 'principal';
}

const MESSAGE_LIMIT: RealtimeRatePolicy = {
  name: 'connect.chat.send',
  limit: 5,
  windowMs: 1_000,
  keyBy: 'principal',
};
const EVENT_POLICIES: Record<string, RealtimeRatePolicy> = {
  'queue.join': { name: 'connect.queue.join', limit: 3, windowMs: 60_000, keyBy: 'principal' },
  'queue.leave': { name: 'connect.queue.leave', limit: 10, windowMs: 1_000, keyBy: 'principal' },
  heartbeat: { name: 'connect.heartbeat', limit: 2, windowMs: 15_000, keyBy: 'principal' },
  'chat.typing': { name: 'connect.chat.typing', limit: 8, windowMs: 1_000, keyBy: 'principal' },
  'session.next': { name: 'connect.session.end', limit: 5, windowMs: 1_000, keyBy: 'principal' },
  'session.leave': { name: 'connect.session.end', limit: 5, windowMs: 1_000, keyBy: 'principal' },
};

const ALLOWED_ERROR_CODES = new Set<string>([
  ErrorCodes.UNAUTHORIZED,
  ErrorCodes.ACCOUNT_INACTIVE,
  ErrorCodes.AGE_LEVEL_REQUIRED,
  ErrorCodes.CONFLICT,
  ErrorCodes.VALIDATION_ERROR,
  ErrorCodes.RATE_LIMITED,
  ErrorCodes.RATE_LIMIT_UNAVAILABLE,
  ErrorCodes.GATE_DISABLED,
  ErrorCodes.SESSION_NOT_FOUND,
  ErrorCodes.SERVICE_UNAVAILABLE,
  ErrorCodes.CONTENT_BLOCKED,
  ErrorCodes.SAFETY_ESCALATED,
  ErrorCodes.TEMPORARILY_MUTED,
]);

@WebSocketGateway({
  namespace: '/connect',
  maxHttpBufferSize: 8 * 1024,
  pingInterval: 5_000,
  pingTimeout: 15_000,
})
export class ConnectGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly localChatAbuse = new MemoryConnectChatAbuseStore();
  constructor(
    private readonly authService: AuthService,
    @Inject(AUTH_STORE) private readonly authStore: AuthStore,
    private readonly featureFlags: FeatureFlagsService,
    @Inject(RATE_LIMIT_STORE) private readonly rateLimits: RateLimitStore,
    @Inject(CONNECT_PRESENCE_STORE) private readonly presence: ConnectPresenceStore,
    @Inject(CONNECT_REALTIME_PORT) private readonly connect: ConnectRealtimePort,
    @Inject(CONNECT_MATCH_EVENTS) private readonly matchEvents: ConnectSocketMatchEvents,
    @Optional()
    @Inject(CONNECT_CHAT_ABUSE_STORE)
    private readonly chatAbuse?: ConnectChatAbuseStore,
  ) {}

  afterInit(server: Namespace): void {
    this.matchEvents.attach(server);
    // Authenticate in namespace middleware: Nest's async connection hook does not gate event delivery.
    server.use((client, next) => {
      void this.authenticate(client as ConnectSocket).then(
        (principal) => {
          (client as ConnectSocket).data.principal = principal;
          next();
        },
        (error: unknown) => next(new Error(this.errorCode(error))),
      );
    });
  }

  async handleConnection(client: ConnectSocket): Promise<void> {
    const principal = client.data.principal;
    if (!principal) {
      client.disconnect(true);
      return;
    }
    try {
      await client.join(principal.userId);
      await this.presence.refresh(principal.userId, client.id);
    } catch {
      client.emit('error', { code: ErrorCodes.SERVICE_UNAVAILABLE });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: ConnectSocket): Promise<void> {
    const principal = client.data.principal;
    if (principal) await this.presence.remove(principal.userId, client.id).catch(() => undefined);
  }

  @SubscribeMessage('heartbeat')
  async heartbeat(
    @ConnectedSocket() client: ConnectSocket,
    @MessageBody() raw: unknown,
  ): Promise<void> {
    if (!(await this.prepare(client, 'heartbeat', ConnectHeartbeatSchema, raw))) return;
    client.emit('heartbeat.ack', { at: new Date().toISOString() });
  }

  @SubscribeMessage('queue.join')
  async queueJoin(
    @ConnectedSocket() client: ConnectSocket,
    @MessageBody() raw: unknown,
  ): Promise<void> {
    const parsed = await this.prepare(client, 'queue.join', ConnectQueueJoinSchema, raw);
    if (!parsed) return;
    if (parsed.mode === 'video' && !this.featureFlags.isEnabled('GATE:RANDOM_VIDEO')) {
      client.emit('error', { code: ErrorCodes.GATE_DISABLED });
      return;
    }
    try {
      const state = await this.connect.joinQueue(client.data.principal!.userId, parsed);
      client.emit('queue.state', state);
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @SubscribeMessage('queue.leave')
  async queueLeave(
    @ConnectedSocket() client: ConnectSocket,
    @MessageBody() raw: unknown,
  ): Promise<void> {
    if (!(await this.prepare(client, 'queue.leave', ConnectQueueLeaveSchema, raw))) return;
    try {
      await this.connect.leaveQueue(client.data.principal!.userId);
      client.emit('queue.left', {});
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @SubscribeMessage('chat.send')
  async chatSend(
    @ConnectedSocket() client: ConnectSocket,
    @MessageBody() raw: unknown,
  ): Promise<void> {
    const parsed = await this.prepare(
      client,
      'chat.send',
      ConnectChatSendSchema,
      raw,
      MESSAGE_LIMIT,
    );
    if (!parsed) return;
    try {
      const message = await this.connect.sendMessage(client.data.principal!.userId, parsed);
      client.emit('chat.ack', { clientMsgId: parsed.clientMsgId });
      client.to(message.partnerUserId).emit('chat.message', {
        id: message.messageId,
        from: message.senderAlias,
        body: message.body,
        ts: message.occurredAt,
      });
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @SubscribeMessage('chat.typing')
  async chatTyping(
    @ConnectedSocket() client: ConnectSocket,
    @MessageBody() raw: unknown,
  ): Promise<void> {
    const parsed = await this.prepare(client, 'chat.typing', ConnectChatTypingSchema, raw);
    if (!parsed) return;
    try {
      const partnerUserId = await this.connect.typing(
        client.data.principal!.userId,
        parsed.sessionId,
      );
      client.to(partnerUserId).emit('chat.typing', { sessionId: parsed.sessionId });
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @SubscribeMessage('session.next')
  async sessionNext(
    @ConnectedSocket() client: ConnectSocket,
    @MessageBody() raw: unknown,
  ): Promise<void> {
    await this.endSession(client, 'session.next', 'next', raw);
  }

  @SubscribeMessage('session.leave')
  async sessionLeave(
    @ConnectedSocket() client: ConnectSocket,
    @MessageBody() raw: unknown,
  ): Promise<void> {
    await this.endSession(client, 'session.leave', 'leave', raw);
  }

  private async endSession(
    client: ConnectSocket,
    event: string,
    reason: 'next' | 'leave',
    raw: unknown,
  ): Promise<void> {
    const parsed = await this.prepare(client, event, ConnectSessionSchema, raw);
    if (!parsed) return;
    try {
      const partnerUserId = await this.connect.endSession(
        client.data.principal!.userId,
        parsed.sessionId,
        reason,
      );
      client.emit('session.ended', { sessionId: parsed.sessionId, reason });
      if (partnerUserId)
        client.to(partnerUserId).emit('session.ended', { sessionId: parsed.sessionId, reason });
    } catch (error) {
      this.emitError(client, error);
    }
  }

  private async prepare<T>(
    client: ConnectSocket,
    event: string,
    schema: ZodType<T>,
    raw: unknown,
    customPolicy?: RealtimeRatePolicy,
  ): Promise<T | null> {
    if (!(await this.refreshPrincipal(client))) return null;
    const policy = customPolicy ?? EVENT_POLICIES[event];
    const principal = client.data.principal!;
    if (event === 'chat.send') {
      try {
        if (await (this.chatAbuse ?? this.localChatAbuse).isMuted(principal.userId)) {
          client.emit('safety.warning', {
            code: ErrorCodes.TEMPORARILY_MUTED,
            retryAfterMs: 30_000,
          });
          return null;
        }
      } catch {
        client.emit('error', { code: ErrorCodes.RATE_LIMIT_UNAVAILABLE });
        return null;
      }
    }
    if (policy) {
      try {
        const result = await this.rateLimits.consume(policy, `${principal.userId}:${client.id}`);
        if (!result.allowed) {
          if (event === 'chat.send') {
            const flood = await (this.chatAbuse ?? this.localChatAbuse).recordFlood(
              principal.userId,
            );
            if (flood === 'warn') {
              client.emit('safety.warning', {
                code: ErrorCodes.RATE_LIMITED,
                retryAfterMs: result.retryAfterMs,
              });
            } else {
              client.emit('safety.warning', {
                code: ErrorCodes.TEMPORARILY_MUTED,
                retryAfterMs: 30_000,
              });
            }
          } else {
            client.emit('error', {
              code: ErrorCodes.RATE_LIMITED,
              retryAfterMs: result.retryAfterMs,
            });
          }
          return null;
        }
      } catch {
        client.emit('error', { code: ErrorCodes.RATE_LIMIT_UNAVAILABLE });
        return null;
      }
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      client.emit('error', { code: ErrorCodes.VALIDATION_ERROR });
      return null;
    }
    return parsed.data as T;
  }

  private async authenticate(client: ConnectSocket): Promise<SocketPrincipal> {
    const token = client.handshake.auth?.token;
    if (typeof token !== 'string' || !token)
      throw new ConnectRealtimeError(ErrorCodes.UNAUTHORIZED);
    let claims: AuthAccessClaims;
    try {
      claims = await this.authService.verifyAccessToken(token);
    } catch {
      throw new ConnectRealtimeError(ErrorCodes.UNAUTHORIZED);
    }
    const state = await this.authStore.getUserAuthState(claims.sub);
    if (!state || state.accountStatus !== 'active')
      throw new ConnectRealtimeError(ErrorCodes.ACCOUNT_INACTIVE);
    if (state.ageLevel !== 'L2' && state.ageLevel !== 'L3')
      throw new ConnectRealtimeError(ErrorCodes.AGE_LEVEL_REQUIRED);
    return { userId: claims.sub, accessToken: token, claims };
  }

  private async refreshPrincipal(client: ConnectSocket): Promise<boolean> {
    try {
      const principal = await this.authenticate(client);
      client.data.principal = principal;
      await this.presence.refresh(principal.userId, client.id);
      return true;
    } catch (error) {
      this.emitError(client, error);
      client.disconnect(true);
      return false;
    }
  }

  private emitError(client: ConnectSocket, error: unknown): void {
    const code = this.errorCode(error);
    if (
      code === ErrorCodes.CONTENT_BLOCKED ||
      code === ErrorCodes.SAFETY_ESCALATED ||
      code === ErrorCodes.TEMPORARILY_MUTED
    ) {
      client.emit('safety.warning', { code });
      return;
    }
    client.emit('error', { code });
  }

  private errorCode(error: unknown): string {
    if (error instanceof ConnectRealtimeError && ALLOWED_ERROR_CODES.has(error.code))
      return error.code;
    return ErrorCodes.SERVICE_UNAVAILABLE;
  }
}
