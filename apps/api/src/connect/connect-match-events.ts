import type { Namespace } from 'socket.io';
import type { ConnectMatchEvents } from './connect-matchmaker.js';

export const CONNECT_MATCH_EVENTS = Symbol('CONNECT_MATCH_EVENTS');

export class ConnectSocketMatchEvents implements ConnectMatchEvents {
  private namespace: Namespace | null = null;

  attach(namespace: Namespace): void {
    this.namespace = namespace;
  }

  async matchFound(
    userId: string,
    payload: { sessionId: string; partner: { alias: string }; mode: 'text' },
  ): Promise<void> {
    if (!this.namespace) throw new Error('CONNECT_NAMESPACE_NOT_READY');
    this.namespace.to(userId).emit('match.found', payload);
  }

  async sessionEnded(
    userId: string,
    payload: { sessionId: string; reason: 'timeout' | 'block' },
  ): Promise<void> {
    if (!this.namespace) throw new Error('CONNECT_NAMESPACE_NOT_READY');
    this.namespace.to(userId).emit('session.ended', payload);
  }
}
