import type { ConnectChatSendSchema, ConnectQueueJoinSchema } from '@posha/shared';
import type { z } from 'zod';

export type ConnectQueueJoin = z.infer<typeof ConnectQueueJoinSchema>;
export type ConnectChatSend = z.infer<typeof ConnectChatSendSchema>;

export interface QueueState {
  position: number | null;
  estWaitSec: number | null;
}

export interface RelayedMessage {
  partnerUserId: string;
  senderAlias: string;
  messageId: string;
  body: string;
  occurredAt: string;
}

export interface ConnectRealtimePort {
  joinQueue(userId: string, input: ConnectQueueJoin): Promise<QueueState>;
  leaveQueue(userId: string): Promise<void>;
  sendMessage(userId: string, input: ConnectChatSend): Promise<RelayedMessage>;
  typing(userId: string, sessionId: string): Promise<string>;
  endSession(
    userId: string,
    sessionId: string,
    reason: 'next' | 'leave' | 'block',
  ): Promise<string | null>;
}

export const CONNECT_REALTIME_PORT = Symbol('CONNECT_REALTIME_PORT');

export class ConnectRealtimeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ConnectRealtimeError';
  }
}
