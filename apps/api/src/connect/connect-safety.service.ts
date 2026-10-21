import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { ConnectReportSchema, ErrorCodes } from '@posha/shared';
import { generateUuidV7 } from '../auth/auth-crypto.js';
import type { UsersStore } from '../users/users-store.js';
import type { ConnectMessageCipher, ConnectMessageStore } from './connect-message.service.js';
import type { ConnectMatchmaker } from './connect-matchmaker.js';
import type { ConnectSessionStore } from './connect-session.store.js';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export class ConnectSafetyService {
  constructor(
    private readonly pool: Pool,
    private readonly sessions: ConnectSessionStore,
    private readonly messages: ConnectMessageStore,
    private readonly cipher: ConnectMessageCipher,
    private readonly users: UsersStore,
    private readonly matchmaker: ConnectMatchmaker,
    private readonly now: () => Date = () => new Date(),
    private readonly makeId: (date: Date) => string = generateUuidV7,
  ) {}

  async report(userId: string, rawInput: unknown, idempotencyKey: string | undefined) {
    const parsed = ConnectReportSchema.safeParse(rawInput);
    if (!parsed.success) throw new BadRequestException({ code: ErrorCodes.VALIDATION_ERROR });
    if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey))
      throw new BadRequestException({ code: ErrorCodes.VALIDATION_ERROR });
    const session = await this.sessions.findById(parsed.data.sessionId);
    if (!session || (session.userA !== userId && session.userB !== userId))
      throw new NotFoundException({ code: ErrorCodes.NOT_FOUND });
    const createdAt = this.now();
    const snapshotCiphertext = parsed.data.snapshotConsent
      ? this.cipher.encrypt(
          JSON.stringify(
            (await this.messages.listRecent(session.id, 50)).reverse().map((message) => ({
              from: message.senderId === userId ? 'me' : 'partner',
              body: this.cipher.decrypt(message.ciphertext),
              createdAt: message.createdAt.toISOString(),
            })),
          ),
        )
      : null;
    const detailsCiphertext = parsed.data.details ? this.cipher.encrypt(parsed.data.details) : null;
    const reportId = this.makeId(createdAt);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO reports
       (id, reporter_id, target_type, target_id, session_id, reason_code, details_ciphertext,
        snapshot_ciphertext, snapshot_consent, status, idempotency_key, created_at, updated_at)
       VALUES ($1,$2,'session',$3,$3,$4,$5,$6,$7,'open',$8,$9,$9)
       ON CONFLICT (reporter_id, idempotency_key) DO UPDATE
         SET idempotency_key=EXCLUDED.idempotency_key
       RETURNING id`,
      [
        reportId,
        userId,
        session.id,
        parsed.data.reasonCode,
        detailsCiphertext,
        snapshotCiphertext,
        parsed.data.snapshotConsent,
        idempotencyKey,
        createdAt,
      ],
    );
    return { reportId: result.rows[0]!.id, status: 'open' as const };
  }

  async blockSession(userId: string, sessionId: string) {
    const session = await this.sessions.findById(sessionId);
    if (!session || (session.userA !== userId && session.userB !== userId))
      throw new NotFoundException({ code: ErrorCodes.NOT_FOUND });
    const targetUserId = session.userA === userId ? session.userB : session.userA;
    const now = this.now();
    await this.users.blockUser(userId, targetUserId, this.makeId(now), now);
    await this.matchmaker.leaveQueue(userId);
    const activeSession = await this.sessions.findActiveForUser(userId);
    if (
      activeSession &&
      ((activeSession.userA === userId && activeSession.userB === targetUserId) ||
        (activeSession.userB === userId && activeSession.userA === targetUserId))
    ) {
      await this.matchmaker.endSession(userId, activeSession.id, 'block');
    }
    return { blocked: true };
  }
}
