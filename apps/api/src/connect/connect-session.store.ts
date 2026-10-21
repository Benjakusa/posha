import type { Pool } from 'pg';

export interface ConnectSessionRecord {
  id: string;
  userA: string;
  userB: string;
  mode: 'text';
  startedAt: Date;
  endedAt: Date | null;
  endReason: 'next' | 'leave' | 'report' | 'block' | 'timeout' | 'error' | null;
  endedBy: string | null;
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
  mode: 'text';
  started_at: Date;
  ended_at: Date | null;
  end_reason: ConnectSessionRecord['endReason'];
  ended_by: string | null;
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
      `SELECT id, user_a, user_b, mode, started_at, ended_at, end_reason, ended_by
       FROM connect_sessions WHERE ended_at IS NULL`,
    );
    return result.rows.map(mapSession);
  }

  async findActiveForUser(userId: string): Promise<ConnectSessionRecord | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT id, user_a, user_b, mode, started_at, ended_at, end_reason, ended_by
       FROM connect_sessions
       WHERE ended_at IS NULL AND (user_a = $1 OR user_b = $1)
       ORDER BY started_at DESC LIMIT 1`,
      [userId],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }
}
