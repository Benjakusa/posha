import type { Pool } from 'pg';

export interface ConnectSessionRecord {
  id: string;
  userA: string;
  userB: string;
  mode: 'text' | 'video';
  startedAt: Date;
  endedAt: Date | null;
  endReason: 'next' | 'leave' | 'report' | 'block' | 'timeout' | 'error' | null;
  endedBy: string | null;
  videoConsent?: { userA: boolean; userB: boolean };
}

export interface ConnectVideoConsentRecord {
  sessionId: string;
  userId: string;
  partnerUserId: string;
  accepted: boolean;
  mutualAccepted: boolean;
}

export interface ConnectSessionStore {
  create(session: ConnectSessionRecord): Promise<void>;
  end(
    sessionId: string,
    actorUserId: string | null,
    reason: NonNullable<ConnectSessionRecord['endReason']>,
    now: Date,
  ): Promise<string | null>;
  listActive(): Promise<readonly ConnectSessionRecord[]>;
  findActiveForUser(userId: string): Promise<ConnectSessionRecord | null>;
  findById(sessionId: string): Promise<ConnectSessionRecord | null>;
  recordVideoConsent(
    sessionId: string,
    userId: string,
    accepted: boolean,
  ): Promise<ConnectVideoConsentRecord | null>;
  hasMutualVideoConsent(sessionId: string): Promise<boolean>;
}

export const CONNECT_SESSION_STORE = Symbol('CONNECT_SESSION_STORE');

export class MemoryConnectSessionStore implements ConnectSessionStore {
  readonly sessions = new Map<string, ConnectSessionRecord>();

  async create(session: ConnectSessionRecord): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async end(
    sessionId: string,
    actorUserId: string | null,
    reason: NonNullable<ConnectSessionRecord['endReason']>,
    now: Date,
  ): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (
      !session ||
      session.endedAt ||
      (actorUserId && actorUserId !== session.userA && actorUserId !== session.userB)
    ) {
      return null;
    }
    session.endedAt = now;
    session.endedBy = actorUserId;
    session.endReason = reason;
    return actorUserId === session.userA ? session.userB : session.userA;
  }

  async listActive(): Promise<readonly ConnectSessionRecord[]> {
    return [...this.sessions.values()].filter((session) => session.endedAt === null);
  }

  async findById(sessionId: string): Promise<ConnectSessionRecord | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async recordVideoConsent(
    sessionId: string,
    userId: string,
    accepted: boolean,
  ): Promise<ConnectVideoConsentRecord | null> {
    const session = this.sessions.get(sessionId);
    if (
      !session ||
      session.mode !== 'video' ||
      session.endedAt !== null ||
      (session.userA !== userId && session.userB !== userId)
    )
      return null;
    const videoConsent = session.videoConsent ?? { userA: false, userB: false };
    videoConsent[session.userA === userId ? 'userA' : 'userB'] = accepted;
    session.videoConsent = videoConsent;
    return {
      sessionId,
      userId,
      partnerUserId: session.userA === userId ? session.userB : session.userA,
      accepted,
      mutualAccepted: videoConsent.userA && videoConsent.userB,
    };
  }

  async hasMutualVideoConsent(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    return Boolean(
      session &&
      session.mode === 'video' &&
      session.endedAt === null &&
      session.videoConsent?.userA &&
      session.videoConsent.userB,
    );
  }

  async findActiveForUser(userId: string): Promise<ConnectSessionRecord | null> {
    return (
      [...this.sessions.values()].find(
        (session) =>
          session.endedAt === null && (session.userA === userId || session.userB === userId),
      ) ?? null
    );
  }
}

interface SessionRow {
  id: string;
  user_a: string;
  user_b: string;
  mode: 'text' | 'video';
  started_at: Date;
  ended_at: Date | null;
  end_reason: ConnectSessionRecord['endReason'];
  ended_by: string | null;
  flags?: { videoConsent?: { userA?: boolean; userB?: boolean } };
}

function mapSession(row: SessionRow): ConnectSessionRecord {
  return {
    id: row.id,
    userA: row.user_a,
    userB: row.user_b,
    mode: row.mode,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    endedBy: row.ended_by,
    ...(row.flags?.videoConsent
      ? {
          videoConsent: {
            userA: row.flags.videoConsent.userA === true,
            userB: row.flags.videoConsent.userB === true,
          },
        }
      : {}),
  };
}

export class PostgresConnectSessionStore implements ConnectSessionStore {
  constructor(private readonly pool: Pool) {}

  async create(session: ConnectSessionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO connect_sessions (id, mode, user_a, user_b, started_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.id, session.mode, session.userA, session.userB, session.startedAt],
    );
  }

  async end(
    sessionId: string,
    actorUserId: string | null,
    reason: NonNullable<ConnectSessionRecord['endReason']>,
    now: Date,
  ): Promise<string | null> {
    const result = await this.pool.query<{ user_a: string; user_b: string }>(
      `UPDATE connect_sessions
       SET ended_at = $4, ended_by = $2, end_reason = $3, updated_at = $4
       WHERE id = $1 AND ended_at IS NULL
         AND ($2::uuid IS NULL OR user_a = $2 OR user_b = $2)
       RETURNING user_a, user_b`,
      [sessionId, actorUserId, reason, now],
    );
    const session = result.rows[0];
    if (!session) return null;
    return actorUserId === session.user_a ? session.user_b : session.user_a;
  }

  async listActive(): Promise<readonly ConnectSessionRecord[]> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, user_a, user_b, mode, started_at, ended_at, end_reason, ended_by, flags
       FROM connect_sessions WHERE ended_at IS NULL`,
    );
    return result.rows.map(mapSession);
  }

  async findById(sessionId: string): Promise<ConnectSessionRecord | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, user_a, user_b, mode, started_at, ended_at, end_reason, ended_by, flags
       FROM connect_sessions WHERE id = $1`,
      [sessionId],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async findActiveForUser(userId: string): Promise<ConnectSessionRecord | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, user_a, user_b, mode, started_at, ended_at, end_reason, ended_by, flags
       FROM connect_sessions
       WHERE ended_at IS NULL AND (user_a = $1 OR user_b = $1)
       ORDER BY started_at DESC LIMIT 1`,
      [userId],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async recordVideoConsent(
    sessionId: string,
    userId: string,
    accepted: boolean,
  ): Promise<ConnectVideoConsentRecord | null> {
    const result = await this.pool.query<{
      id: string;
      user_a: string;
      user_b: string;
      accepted: boolean;
      consent_a: boolean;
      consent_b: boolean;
    }>(
      `WITH updated AS (
         UPDATE connect_sessions
         SET flags = jsonb_set(
           flags,
           '{videoConsent}',
           COALESCE(flags->'videoConsent', '{}'::jsonb) ||
             jsonb_build_object(CASE WHEN user_a=$2 THEN 'userA' ELSE 'userB' END, $3::boolean),
           true
         ), updated_at=$4
         WHERE id=$1 AND mode='video' AND ended_at IS NULL AND (user_a=$2 OR user_b=$2)
         RETURNING id, user_a, user_b, flags
       )
       SELECT id, user_a, user_b, $3::boolean AS accepted,
         COALESCE((flags->'videoConsent'->>'userA')::boolean, false) AS consent_a,
         COALESCE((flags->'videoConsent'->>'userB')::boolean, false) AS consent_b
       FROM updated`,
      [sessionId, userId, accepted, new Date()],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      sessionId: row.id,
      userId,
      partnerUserId: row.user_a === userId ? row.user_b : row.user_a,
      accepted: row.accepted,
      mutualAccepted: row.consent_a && row.consent_b,
    };
  }

  async hasMutualVideoConsent(sessionId: string): Promise<boolean> {
    const result = await this.pool.query<{ mutual: boolean }>(
      `SELECT mode='video' AND ended_at IS NULL
         AND COALESCE((flags->'videoConsent'->>'userA')::boolean, false)
         AND COALESCE((flags->'videoConsent'->>'userB')::boolean, false) AS mutual
       FROM connect_sessions WHERE id=$1`,
      [sessionId],
    );
    return result.rows[0]?.mutual === true;
  }
}
