import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { ErrorCodes } from '@posha/shared';
import { generateUuidV7 } from '../auth/auth-crypto.js';
import { ConnectRealtimeError } from './connect-realtime.port.js';
import type { RelayedMessage } from './connect-realtime.port.js';
import type { ConnectSessionRecord, ConnectSessionStore } from './connect-session.store.js';

export type ConnectModerationCategory = 'minor_safety' | 'solicitation' | 'threat' | 'explicit';
export interface ModerationProvider {
  classifyText(body: string): Promise<readonly ConnectModerationCategory[]>;
}
export interface ConnectMessageCipher {
  encrypt(plaintext: string): Buffer;
  decrypt(envelope: Buffer): string;
}
export interface ConnectMessageRecord {
  id: string;
  sessionId: string;
  senderId: string;
  clientMsgId: string;
  ciphertext: Buffer;
  createdAt: Date;
  flagged: boolean;
  expiresAt: Date;
}
export interface ConnectMessageStore {
  createOrGet(record: ConnectMessageRecord): Promise<ConnectMessageRecord>;
  findActiveSession(sessionId: string): Promise<ConnectSessionRecord | null>;
  recordModerationFlag(input: {
    messageId: string;
    sessionId: string;
    userId: string;
    categories: readonly ConnectModerationCategory[];
    severity: 'review' | 'urgent';
    createdAt: Date;
  }): Promise<boolean>;
  listRecent(
    sessionId: string,
    limit: number,
  ): Promise<{ senderId: string; ciphertext: Buffer; createdAt: Date }[]>;
  deleteExpired(now: Date, limit: number): Promise<number>;
}
export const CONNECT_MESSAGE_STORE = Symbol('CONNECT_MESSAGE_STORE');
export const CONNECT_MESSAGE_CIPHER = Symbol('CONNECT_MESSAGE_CIPHER');
export const CONNECT_MODERATION_PROVIDER = Symbol('CONNECT_MODERATION_PROVIDER');

export class AesGcmConnectMessageCipher implements ConnectMessageCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('CONNECT_MESSAGE_KEY_MUST_BE_32_BYTES');
  }
  encrypt(plaintext: string): Buffer {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
  }
  decrypt(envelope: Buffer): string {
    if (envelope.length < 29) throw new Error('CONNECT_MESSAGE_CIPHERTEXT_INVALID');
    const decipher = createDecipheriv('aes-256-gcm', this.key, envelope.subarray(0, 12));
    decipher.setAuthTag(envelope.subarray(12, 28));
    return Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]).toString(
      'utf8',
    );
  }
}

/** Deterministic local provider for development and tests; production can inject a classifier. */
export class KeywordModerationProvider implements ModerationProvider {
  async classifyText(body: string): Promise<readonly ConnectModerationCategory[]> {
    const text = body.normalize('NFKC').toLowerCase();
    const categories: ConnectModerationCategory[] = [];
    if (/\b(minor|underage|child|schoolgirl|schoolboy)\b/.test(text))
      categories.push('minor_safety');
    if (/\b(pay me|send money|meet me|my number|whatsapp me)\b/.test(text))
      categories.push('solicitation');
    if (/\b(kill you|hurt you|find you)\b/.test(text)) categories.push('threat');
    if (/\b(explicit|sexual|nude)\b/.test(text)) categories.push('explicit');
    return categories;
  }
}

export class PostgresConnectMessageStore implements ConnectMessageStore {
  constructor(private readonly pool: Pool) {}
  async createOrGet(record: ConnectMessageRecord): Promise<ConnectMessageRecord> {
    const result = await this.pool.query<{
      id: string;
      session_id: string;
      sender_id: string;
      client_msg_id: string;
      body_ciphertext: Buffer;
      created_at: Date;
      moderation_flag: boolean;
      expires_at: Date;
    }>(
      `INSERT INTO connect_messages
       (id, session_id, sender_id, client_msg_id, body_ciphertext, created_at, moderation_flag, expires_at)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8
       WHERE EXISTS (SELECT 1 FROM connect_sessions s WHERE s.id=$2 AND s.ended_at IS NULL
         AND s.mode='text' AND (s.user_a=$3 OR s.user_b=$3))
       ON CONFLICT (sender_id, client_msg_id) DO UPDATE SET client_msg_id = EXCLUDED.client_msg_id
       RETURNING id, session_id, sender_id, client_msg_id, body_ciphertext, created_at, moderation_flag, expires_at`,
      [
        record.id,
        record.sessionId,
        record.senderId,
        record.clientMsgId,
        record.ciphertext,
        record.createdAt,
        record.flagged,
        record.expiresAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new ConnectRealtimeError(ErrorCodes.SESSION_NOT_FOUND);
    return {
      id: row.id,
      sessionId: row.session_id,
      senderId: row.sender_id,
      clientMsgId: row.client_msg_id,
      ciphertext: row.body_ciphertext,
      createdAt: row.created_at,
      flagged: row.moderation_flag,
      expiresAt: row.expires_at,
    };
  }
  async listRecent(sessionId: string, limit: number) {
    const result = await this.pool.query<{
      sender_id: string;
      body_ciphertext: Buffer;
      created_at: Date;
    }>(
      `SELECT sender_id, body_ciphertext, created_at FROM connect_messages
       WHERE session_id=$1 AND expires_at > now() ORDER BY created_at DESC, id DESC LIMIT $2`,
      [sessionId, limit],
    );
    return result.rows.map((row) => ({
      senderId: row.sender_id,
      ciphertext: row.body_ciphertext,
      createdAt: row.created_at,
    }));
  }
  async findActiveSession(sessionId: string): Promise<ConnectSessionRecord | null> {
    const result = await this.pool.query<{
      id: string;
      user_a: string;
      user_b: string;
      mode: 'text';
      started_at: Date;
      ended_at: Date | null;
      end_reason: ConnectSessionRecord['endReason'];
      ended_by: string | null;
    }>(
      `SELECT id,user_a,user_b,mode,started_at,ended_at,end_reason,ended_by
        FROM connect_sessions WHERE id=$1 AND ended_at IS NULL AND mode='text'`,
      [sessionId],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          userA: row.user_a,
          userB: row.user_b,
          mode: row.mode,
          startedAt: row.started_at,
          endedAt: row.ended_at,
          endReason: row.end_reason,
          endedBy: row.ended_by,
        }
      : null;
  }
  async recordModerationFlag(
    input: Parameters<ConnectMessageStore['recordModerationFlag']>[0],
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO connect_moderation_flags (message_id, session_id, user_id, categories, severity, created_at)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (message_id) DO NOTHING`,
        [
          input.messageId,
          input.sessionId,
          input.userId,
          input.categories,
          input.severity,
          input.createdAt,
        ],
      );
      const repeated = input.categories.includes('explicit')
        ? await client.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM connect_moderation_flags
           WHERE user_id=$1 AND created_at >= $2 AND categories @> ARRAY['explicit']::text[]`,
            [input.userId, new Date(input.createdAt.getTime() - 24 * 60 * 60_000)],
          )
        : { rows: [{ count: '0' }] };
      const escalate = Number(repeated.rows[0]?.count ?? 0) >= 3;
      if (escalate)
        await client.query(
          `UPDATE connect_moderation_flags SET severity='urgent' WHERE message_id=$1`,
          [input.messageId],
        );
      await client.query('COMMIT');
      return escalate;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async deleteExpired(now: Date, limit: number): Promise<number> {
    const result = await this.pool.query(
      `WITH expired AS (SELECT id FROM connect_messages WHERE expires_at <= $1
        ORDER BY expires_at LIMIT $2 FOR UPDATE SKIP LOCKED)
       DELETE FROM connect_messages m USING expired e WHERE m.id=e.id`,
      [now, limit],
    );
    return result.rowCount ?? 0;
  }
}

export class MemoryConnectMessageStore implements ConnectMessageStore {
  readonly messages = new Map<string, ConnectMessageRecord>();
  readonly moderationFlags: Parameters<ConnectMessageStore['recordModerationFlag']>[0][] = [];
  constructor(private readonly sessions: ConnectSessionStore) {}
  async createOrGet(record: ConnectMessageRecord): Promise<ConnectMessageRecord> {
    const existing = [...this.messages.values()].find(
      (m) => m.senderId === record.senderId && m.clientMsgId === record.clientMsgId,
    );
    if (existing) return existing;
    this.messages.set(record.id, { ...record });
    return record;
  }
  async findActiveSession(sessionId: string): Promise<ConnectSessionRecord | null> {
    return (await this.sessions.listActive()).find((s) => s.id === sessionId) ?? null;
  }
  async recordModerationFlag(
    input: Parameters<ConnectMessageStore['recordModerationFlag']>[0],
  ): Promise<boolean> {
    if (this.moderationFlags.some((flag) => flag.messageId === input.messageId)) return false;
    this.moderationFlags.push(input);
    if (!input.categories.includes('explicit')) return false;
    const cutoff = input.createdAt.getTime() - 24 * 60 * 60_000;
    const escalate =
      this.moderationFlags.filter(
        (flag) =>
          flag.userId === input.userId &&
          flag.createdAt.getTime() >= cutoff &&
          flag.categories.includes('explicit'),
      ).length >= 3;
    if (escalate) input.severity = 'urgent';
    return escalate;
  }
  async listRecent(sessionId: string, limit: number) {
    return [...this.messages.values()]
      .reverse()
      .filter((message) => message.sessionId === sessionId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((message) => ({
        senderId: message.senderId,
        ciphertext: message.ciphertext,
        createdAt: message.createdAt,
      }));
  }
  async deleteExpired(now: Date, limit: number): Promise<number> {
    let deleted = 0;
    for (const [id, message] of this.messages) {
      if (message.expiresAt <= now && deleted < limit) {
        this.messages.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }
}

export class ConnectMessageService {
  constructor(
    private readonly store: ConnectMessageStore,
    private readonly cipher: ConnectMessageCipher,
    private readonly moderation: ModerationProvider,
    private readonly now: () => Date = () => new Date(),
    private readonly makeId: (date: Date) => string = generateUuidV7,
  ) {}
  async activePartner(userId: string, sessionId: string): Promise<string> {
    const session = await this.store.findActiveSession(sessionId);
    if (!session || (session.userA !== userId && session.userB !== userId))
      throw new ConnectRealtimeError(ErrorCodes.SESSION_NOT_FOUND);
    return session.userA === userId ? session.userB : session.userA;
  }
  async send(
    userId: string,
    input: { sessionId: string; body: string; clientMsgId: string },
  ): Promise<RelayedMessage> {
    const session = await this.store.findActiveSession(input.sessionId);
    if (!session || (session.userA !== userId && session.userB !== userId))
      throw new ConnectRealtimeError(ErrorCodes.SESSION_NOT_FOUND);
    const categories = await this.moderation.classifyText(input.body);
    const now = this.now();
    const flagged = categories.length > 0;
    const record = await this.store.createOrGet({
      id: this.makeId(now),
      sessionId: session.id,
      senderId: userId,
      clientMsgId: input.clientMsgId,
      ciphertext: this.cipher.encrypt(input.body),
      createdAt: now,
      flagged,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    if (
      record.sessionId !== session.id ||
      record.senderId !== userId ||
      this.cipher.decrypt(record.ciphertext) !== input.body
    )
      throw new ConnectRealtimeError(ErrorCodes.CONFLICT);
    if (flagged) {
      const urgent = categories.includes('minor_safety') || categories.includes('threat');
      const repeatedExplicit = await this.store.recordModerationFlag({
        messageId: record.id,
        sessionId: session.id,
        userId,
        categories,
        severity: urgent ? 'urgent' : 'review',
        createdAt: now,
      });
      throw new ConnectRealtimeError(
        urgent || repeatedExplicit ? ErrorCodes.SAFETY_ESCALATED : ErrorCodes.CONTENT_BLOCKED,
      );
    }
    const partnerUserId = session.userA === userId ? session.userB : session.userA;
    return {
      partnerUserId,
      senderAlias: '',
      messageId: record.id,
      body: this.cipher.decrypt(record.ciphertext),
      occurredAt: record.createdAt.toISOString(),
    };
  }
}
