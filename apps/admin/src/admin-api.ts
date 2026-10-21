export const ADMIN_ROLES = [
  'moderator',
  'finance_admin',
  'support_agent',
  'compliance_officer',
  'super_admin',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface StaffSession {
  subject: string;
  displayName: string;
  roles: readonly AdminRole[];
  mfaVerified: boolean;
}

export interface AuditRecord {
  id: string;
  occurredAt: string;
  actorRole: AdminRole;
  action: string;
  entityType: string;
  entityReference: string;
  reason: string | null;
}

export interface GateRecord {
  key: string;
  enabled: boolean;
  status: 'blocked' | 'approved';
  evidenceRef: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface GateApproval {
  evidenceRef: string;
  reason: string;
}

export type ModerationAction = 'warn' | 'mute' | 'suspend' | 'ban' | 'remove_content';
export interface ModerationReport {
  id: string;
  target: string;
  targetType: 'user' | 'session' | 'message' | 'media' | 'room';
  reasonCode: string;
  status: 'open' | 'triaged' | 'actioned' | 'dismissed' | 'escalated' | 'appealed';
  priority: 'urgent' | 'review';
  createdAt: string;
  evidenceAvailable: boolean;
}
export interface ModerationAppeal {
  id: string;
  action: ModerationAction;
  target: string;
  createdAt: string;
  reason: string;
  originalReviewer: string;
  permanent: boolean;
}
export interface ModerationDecision {
  action: ModerationAction;
  reason: string;
  expiresAt?: string;
}

export interface AdminApi {
  getSession(): Promise<StaffSession | null>;
  beginSso(): Promise<void>;
  verifyMfa(code: string): Promise<StaffSession>;
  getAuditLog(): Promise<readonly AuditRecord[]>;
  getGates(): Promise<readonly GateRecord[]>;
  enableGate(key: string, approval: GateApproval): Promise<void>;
  getReports(): Promise<readonly ModerationReport[]>;
  takeModerationAction(reportId: string, decision: ModerationDecision): Promise<void>;
  getAppeals(): Promise<readonly ModerationAppeal[]>;
  decideAppeal(appealId: string, accepted: boolean, reason: string): Promise<void>;
}

/** Production adapter. Auth endpoints are intentionally unavailable until an SSO vendor is selected. */
export class HttpAdminApi implements AdminApi {
  constructor(private readonly baseUrl = '/api') {}

  async getSession(): Promise<StaffSession | null> {
    const response = await fetch(`${this.baseUrl}/admin/session`, { credentials: 'include' });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('Admin session could not be loaded.');
    return (await response.json()) as StaffSession;
  }

  async beginSso(): Promise<void> {
    throw new Error('Staff single sign-on is not configured.');
  }

  async verifyMfa(code: string): Promise<StaffSession> {
    void code;
    throw new Error('Staff single sign-on is not configured.');
  }

  async getAuditLog(): Promise<readonly AuditRecord[]> {
    const response = await fetch(`${this.baseUrl}/admin/audit`, { credentials: 'include' });
    if (!response.ok) throw new Error('Audit records are unavailable.');
    return (await response.json()) as readonly AuditRecord[];
  }

  async getGates(): Promise<readonly GateRecord[]> {
    const response = await fetch(`${this.baseUrl}/admin/flags`, { credentials: 'include' });
    if (!response.ok) throw new Error('Gate configuration is unavailable.');
    return (await response.json()) as readonly GateRecord[];
  }

  async enableGate(key: string, approval: GateApproval): Promise<void> {
    const response = await fetch(`${this.baseUrl}/admin/flags/${encodeURIComponent(key)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(approval),
    });
    if (!response.ok) throw new Error('Gate approval was rejected.');
  }

  async getReports(): Promise<readonly ModerationReport[]> {
    const response = await fetch(`${this.baseUrl}/admin/reports?status=open`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Moderation queue is unavailable.');
    return (await response.json()) as readonly ModerationReport[];
  }

  async takeModerationAction(reportId: string, decision: ModerationDecision): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/admin/reports/${encodeURIComponent(reportId)}/action`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(decision),
      },
    );
    if (!response.ok) throw new Error('Moderation action was rejected.');
  }

  async getAppeals(): Promise<readonly ModerationAppeal[]> {
    const response = await fetch(`${this.baseUrl}/admin/appeals`, { credentials: 'include' });
    if (!response.ok) throw new Error('Appeals are unavailable.');
    return (await response.json()) as readonly ModerationAppeal[];
  }

  async decideAppeal(appealId: string, accepted: boolean, reason: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/admin/appeals/${encodeURIComponent(appealId)}/decide`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ decision: accepted ? 'accepted' : 'rejected', reason }),
      },
    );
    if (!response.ok) throw new Error('Appeal decision was rejected.');
  }
}

export class UnconfiguredStaffAuthError extends Error {
  constructor() {
    super('Staff single sign-on is not configured.');
    this.name = 'UnconfiguredStaffAuthError';
  }
}
