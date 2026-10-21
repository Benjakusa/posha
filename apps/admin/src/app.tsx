import { useEffect, useMemo, useState } from 'react';
import type {
  AdminApi,
  AdminRole,
  AuditRecord,
  GateRecord,
  ModerationAction,
  ModerationDecision,
  ModerationReport,
  StaffSession,
} from './admin-api.js';
import './styles.css';

type Page = 'overview' | 'audit' | 'gates' | 'moderation';

const roleLabels: Record<AdminRole, string> = {
  moderator: 'Moderator',
  finance_admin: 'Finance admin',
  support_agent: 'Support agent',
  compliance_officer: 'Compliance officer',
  super_admin: 'Super admin',
};

function mayReadAudit(session: StaffSession): boolean {
  return session.roles.some((role) => role === 'compliance_officer' || role === 'super_admin');
}

function mayReadGates(session: StaffSession): boolean {
  return session.roles.some((role) => role === 'compliance_officer' || role === 'super_admin');
}

function mayUpdateGates(session: StaffSession): boolean {
  return session.roles.includes('super_admin');
}

function mayReadModeration(session: StaffSession): boolean {
  return session.roles.some((role) =>
    ['moderator', 'support_agent', 'compliance_officer', 'super_admin'].includes(role),
  );
}

function mayActOnModeration(session: StaffSession): boolean {
  return session.roles.some((role) => role === 'moderator' || role === 'super_admin');
}

function mayOpenAdmin(session: StaffSession | null): session is StaffSession {
  return Boolean(session?.mfaVerified && session.roles.length > 0);
}

export function AdminApp({ api }: { api: AdminApi }) {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [authStarted, setAuthStarted] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [page, setPage] = useState<Page>('overview');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let active = true;
    void api
      .getSession()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch(() => {
        if (active) setAuthError('Could not check your staff session. Try again.');
      })
      .finally(() => {
        if (active) setLoadingSession(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  async function beginSso() {
    setAuthError('');
    try {
      await api.beginSso();
      setAuthStarted(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign-in could not start.');
    }
  }

  async function verifyMfa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');
    try {
      const verified = await api.verifyMfa(mfaCode);
      if (!verified.mfaVerified || verified.roles.length === 0) {
        setAuthError('Your verified staff session does not include an admin role.');
        return;
      }
      setSession(verified);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Two-factor verification failed.');
    }
  }

  if (loadingSession)
    return (
      <main className="admin-login">
        <p role="status">Checking staff session…</p>
      </main>
    );
  if (!mayOpenAdmin(session)) {
    return (
      <main className="admin-login">
        <div className="login-card">
          <div className="brand-mark" aria-hidden="true">
            P
          </div>
          <p className="eyebrow">POSHA · INTERNAL</p>
          <h1>Admin workspace</h1>
          <p className="muted">
            Staff access requires organization SSO and a verified second factor.
          </p>
          {authStarted ? (
            <form onSubmit={(event) => void verifyMfa(event)}>
              <label htmlFor="mfa-code">Authenticator code</label>
              <input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
              />
              <button className="primary-button" type="submit">
                Verify and continue
              </button>
            </form>
          ) : (
            <button className="primary-button" type="button" onClick={() => void beginSso()}>
              Continue with organization SSO
            </button>
          )}
          {authError && (
            <p className="error-message" role="alert">
              {authError}
            </p>
          )}
          <p className="login-footnote">
            Access is granted by your staff role. Private conversations and identity documents are
            not available in this workspace.
          </p>
        </div>
      </main>
    );
  }

  const links: { id: Page; label: string; available: boolean }[] = [
    { id: 'overview', label: 'Overview', available: true },
    { id: 'audit', label: 'Audit log', available: mayReadAudit(session) },
    { id: 'gates', label: 'Flags & gates', available: mayReadGates(session) },
    { id: 'moderation', label: 'Reports & appeals', available: mayReadModeration(session) },
  ];
  const visibleLinks = links.filter((link) => link.available);
  const currentPage = visibleLinks.some((link) => link.id === page) ? page : 'overview';

  return (
    <div className="admin-shell">
      <aside className="sidebar" aria-label="Admin navigation">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span>
            POSHA <small>ADMIN</small>
          </span>
        </div>
        <nav>
          {visibleLinks.map((link) => (
            <button
              key={link.id}
              className={`nav-link ${currentPage === link.id ? 'active' : ''}`}
              aria-current={currentPage === link.id ? 'page' : undefined}
              onClick={() => setPage(link.id)}
            >
              {link.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Staff session verified
        </div>
      </aside>
      <main className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">INTERNAL TOOLS</p>
            <h1>
              {currentPage === 'overview'
                ? 'Overview'
                : currentPage === 'audit'
                  ? 'Audit log'
                  : currentPage === 'gates'
                    ? 'Flags & gates'
                    : 'Reports & appeals'}
            </h1>
          </div>
          <div className="identity">
            <span className="avatar-initial" aria-hidden="true">
              {session.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{session.displayName}</strong>
              <small>{session.roles.map((role) => roleLabels[role]).join(' · ')}</small>
            </span>
          </div>
        </header>
        {currentPage === 'overview' && <Overview session={session} />}
        {currentPage === 'audit' && <AuditPage api={api} />}
        {currentPage === 'gates' && <GatesPage api={api} canUpdate={mayUpdateGates(session)} />}
        {currentPage === 'moderation' && (
          <ModerationPage
            api={api}
            canAct={mayActOnModeration(session)}
            staffSubject={session.subject}
          />
        )}
      </main>
    </div>
  );
}

function ModerationPage({
  api,
  canAct,
  staffSubject,
}: {
  api: AdminApi;
  canAct: boolean;
  staffSubject: string;
}) {
  const [reports, setReports] = useState<readonly ModerationReport[]>([]);
  const [appeals, setAppeals] = useState<Awaited<ReturnType<AdminApi['getAppeals']>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const [decisions, setDecisions] = useState<Record<string, ModerationDecision>>({});
  const [appealReasons, setAppealReasons] = useState<Record<string, string>>({});

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [nextReports, nextAppeals] = await Promise.all([api.getReports(), api.getAppeals()]);
      setReports(
        [...nextReports].sort((a, b) => {
          if (a.priority !== b.priority) return a.priority === 'urgent' ? -1 : 1;
          return Date.parse(a.createdAt) - Date.parse(b.createdAt);
        }),
      );
      setAppeals(nextAppeals);
    } catch {
      setError('Reports and appeals could not be loaded. Staff access may not be configured.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [api]);

  function updateDecision(reportId: string, patch: Partial<ModerationDecision>) {
    setDecisions((current) => ({
      ...current,
      [reportId]: { action: 'warn', reason: '', ...current[reportId], ...patch },
    }));
  }
  async function submitAction(report: ModerationReport) {
    const decision = decisions[report.id];
    if (!canAct || !decision?.reason.trim()) return;
    if (['mute', 'suspend'].includes(decision.action) && !decision.expiresAt) return;
    setPending(report.id);
    setError('');
    try {
      await api.takeModerationAction(report.id, decision);
      await refresh();
    } catch {
      setError('The moderation action was not recorded.');
    } finally {
      setPending('');
    }
  }
  async function decideAppeal(appealId: string, accepted: boolean) {
    const reason = appealReasons[appealId]?.trim();
    if (!canAct || !reason) return;
    setPending(appealId);
    setError('');
    try {
      await api.decideAppeal(appealId, accepted, reason);
      await refresh();
    } catch {
      setError('The appeal decision was not recorded.');
    } finally {
      setPending('');
    }
  }

  return (
    <section className="content-section" aria-labelledby="moderation-title">
      <div className="section-intro">
        <div>
          <h2 id="moderation-title">Safety review</h2>
          <p className="muted">
            Urgent reports are listed first. Conversation content stays sealed.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          Refresh queue
        </button>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading reports and appeals…</p>
      ) : (
        <>
          <h3 className="moderation-subtitle">
            Reports <span className="count-pill">{reports.length}</span>
          </h3>
          {reports.length === 0 ? (
            <div className="empty-panel">
              <h3>No open reports</h3>
              <p>New reports will appear here for review.</p>
            </div>
          ) : (
            <div className="moderation-list">
              {reports.map((report) => (
                <ModerationReportCard
                  key={report.id}
                  report={report}
                  canAct={canAct}
                  decision={decisions[report.id] ?? { action: 'warn', reason: '' }}
                  disabled={pending === report.id}
                  onChange={(patch) => updateDecision(report.id, patch)}
                  onSubmit={() => void submitAction(report)}
                />
              ))}
            </div>
          )}
          <h3 className="moderation-subtitle">
            Appeals <span className="count-pill">{appeals.length}</span>
          </h3>
          {appeals.length === 0 ? (
            <div className="empty-panel">
              <h3>No open appeals</h3>
              <p>Member appeals will appear here for independent review.</p>
            </div>
          ) : (
            <div className="moderation-list">
              {appeals.map((appeal) => {
                const secondReviewerRequired =
                  appeal.permanent && appeal.originalReviewer === staffSubject;
                return (
                  <article className="moderation-card" key={appeal.id}>
                    <div className="moderation-card-head">
                      <div>
                        <span className="priority-pill">Appeal</span>
                        <h4>
                          {appeal.action.replace('_', ' ')} · {appeal.target}
                        </h4>
                      </div>
                      <time>{new Date(appeal.createdAt).toLocaleString()}</time>
                    </div>
                    <p>{appeal.reason}</p>
                    {appeal.permanent && (
                      <p className="muted">
                        Permanent action · original reviewer {appeal.originalReviewer}
                      </p>
                    )}
                    {canAct ? (
                      <div className="moderation-fields">
                        <label>
                          Decision reason
                          <textarea
                            value={appealReasons[appeal.id] ?? ''}
                            onChange={(event) =>
                              setAppealReasons({
                                ...appealReasons,
                                [appeal.id]: event.target.value,
                              })
                            }
                            required
                          />
                        </label>
                        {secondReviewerRequired && (
                          <p className="role-note">
                            A different moderator must decide this permanent-action appeal.
                          </p>
                        )}
                        <div className="moderation-buttons">
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={
                              !appealReasons[appeal.id]?.trim() ||
                              secondReviewerRequired ||
                              pending === appeal.id
                            }
                            onClick={() => void decideAppeal(appeal.id, true)}
                          >
                            Accept appeal
                          </button>
                          <button
                            type="button"
                            className="outline-button"
                            disabled={
                              !appealReasons[appeal.id]?.trim() ||
                              secondReviewerRequired ||
                              pending === appeal.id
                            }
                            onClick={() => void decideAppeal(appeal.id, false)}
                          >
                            Reject appeal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="role-note">Read-only. A moderator must decide this appeal.</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {!canAct && (
            <p className="muted role-note">
              Read-only queue. Only moderators and super admins can record actions.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function ModerationReportCard({
  report,
  canAct,
  decision,
  disabled,
  onChange,
  onSubmit,
}: {
  report: ModerationReport;
  canAct: boolean;
  decision: ModerationDecision;
  disabled: boolean;
  onChange(patch: Partial<ModerationDecision>): void;
  onSubmit(): void;
}) {
  const durationRequired = decision.action === 'mute' || decision.action === 'suspend';
  return (
    <article className="moderation-card">
      <div className="moderation-card-head">
        <div>
          <span className={`priority-pill ${report.priority}`}>
            {report.priority === 'urgent' ? 'Urgent' : 'Review'}
          </span>
          <h4>
            {report.reasonCode.replaceAll('_', ' ')} · {report.targetType}
          </h4>
        </div>
        <time>{new Date(report.createdAt).toLocaleString()}</time>
      </div>
      <p>
        Reference {report.target} · status {report.status}
        {report.evidenceAvailable ? ' · consented evidence available' : ''}
      </p>
      {canAct ? (
        <div className="moderation-fields">
          <label>
            Action
            <select
              value={decision.action}
              onChange={(event) => onChange({ action: event.target.value as ModerationAction })}
            >
              <option value="warn">Warn</option>
              <option value="mute">Mute</option>
              <option value="suspend">Suspend</option>
              <option value="ban">Ban</option>
              <option value="remove_content">Remove content</option>
            </select>
          </label>
          {durationRequired && (
            <label>
              Expires at
              <input
                type="datetime-local"
                value={decision.expiresAt?.slice(0, 16) ?? ''}
                onChange={(event) =>
                  onChange({
                    expiresAt: event.target.value ? new Date(event.target.value).toISOString() : '',
                  })
                }
                required
              />
            </label>
          )}
          <label>
            Reason
            <textarea
              value={decision.reason}
              onChange={(event) => onChange({ reason: event.target.value })}
              required
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={
              disabled || !decision.reason.trim() || (durationRequired && !decision.expiresAt)
            }
            onClick={onSubmit}
          >
            {disabled ? 'Recording…' : 'Record action'}
          </button>
        </div>
      ) : (
        <p className="role-note">Read-only. A moderator must review and act on this report.</p>
      )}
    </article>
  );
}

function Overview({ session }: { session: StaffSession }) {
  const tools = useMemo(() => {
    const labels = ['Redacted user lookup'];
    if (session.roles.includes('moderator')) labels.push('Reports & appeals');
    if (session.roles.includes('finance_admin')) labels.push('Refunds & payouts');
    if (session.roles.includes('compliance_officer') || session.roles.includes('super_admin'))
      labels.push('Audit & compliance gates');
    if (session.roles.includes('super_admin')) labels.push('Roles & configuration');
    return labels;
  }, [session]);

  return (
    <section className="content-section" aria-labelledby="welcome-title">
      <p className="eyebrow">YOUR ACCESS</p>
      <h2 id="welcome-title">Welcome, {session.displayName}</h2>
      <p className="muted">Tools shown here are based on your assigned staff roles.</p>
      <div className="tool-grid">
        {tools.map((tool) => (
          <article className="tool-card" key={tool}>
            <span className="tool-icon" aria-hidden="true">
              ↗
            </span>
            <h3>{tool}</h3>
            <p>Available to your staff role</p>
          </article>
        ))}
      </div>
      <div className="privacy-note">
        <strong>Privacy by default</strong>
        <p>
          Support and moderation tools do not expose private chats or identity documents. Sensitive
          access requires a reason and is recorded in the audit log.
        </p>
      </div>
    </section>
  );
}

function AuditPage({ api }: { api: AdminApi }) {
  const [records, setRecords] = useState<readonly AuditRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void api
      .getAuditLog()
      .then((value) => {
        if (active) setRecords(value);
      })
      .catch(() => {
        if (active) setError('Audit records could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section className="content-section" aria-labelledby="audit-title">
      <div className="section-intro">
        <div>
          <h2 id="audit-title">Staff activity</h2>
          <p className="muted">
            Append-only record of administrative actions. User details are redacted.
          </p>
        </div>
        <span className="count-pill">{records.length} records</span>
      </div>
      {loading ? (
        <p role="status">Loading audit records…</p>
      ) : error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : records.length === 0 ? (
        <div className="empty-panel">
          <span aria-hidden="true">◷</span>
          <h3>No audit records yet</h3>
          <p>Administrative activity will appear here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Administrative audit records</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Role</th>
                <th scope="col">Action</th>
                <th scope="col">Record</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{new Date(record.occurredAt).toLocaleString()}</td>
                  <td>{roleLabels[record.actorRole]}</td>
                  <td>{record.action}</td>
                  <td>
                    {record.entityType} · {record.entityReference}
                  </td>
                  <td>{record.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GatesPage({ api, canUpdate }: { api: AdminApi; canUpdate: boolean }) {
  const [gates, setGates] = useState<readonly GateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState('');
  async function refresh() {
    setLoading(true);
    setError('');
    try {
      setGates(await api.getGates());
    } catch {
      setError('Gate configuration could not be loaded.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [api]);

  async function enable(gate: GateRecord) {
    const evidenceRef = evidence[gate.key]?.trim();
    const reason = reasons[gate.key]?.trim();
    if (!canUpdate || !evidenceRef || !reason) return;
    setSaving(gate.key);
    setError('');
    try {
      await api.enableGate(gate.key, { evidenceRef, reason });
      await refresh();
      setEvidence((current) => ({ ...current, [gate.key]: '' }));
      setReasons((current) => ({ ...current, [gate.key]: '' }));
    } catch {
      setError(`Approval for ${gate.key} was not recorded.`);
    } finally {
      setSaving('');
    }
  }

  return (
    <section className="content-section" aria-labelledby="gates-title">
      <div className="section-intro">
        <div>
          <h2 id="gates-title">Feature and compliance gates</h2>
          <p className="muted">
            Every gate remains blocked until an authorized approval is recorded.
          </p>
        </div>
        <span className="count-pill">
          {gates.filter((gate) => gate.enabled && gate.status === 'approved').length} enabled
        </span>
      </div>
      <div className="gate-warning">
        <strong>Production safety</strong>
        <p>
          Enabling a gate requires super admin access, an approval evidence reference, and a reason.
          Changes must be enforced and audited by the server.
        </p>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading gate configuration…</p>
      ) : gates.length === 0 && !error ? (
        <div className="empty-panel">
          <h3>No gate records returned</h3>
          <p>Gate state must come from the server.</p>
        </div>
      ) : (
        <div className="gate-list">
          {gates.map((gate) => (
            <article className="gate-card" key={gate.key}>
              <div className="gate-head">
                <div>
                  <h3>{gate.key}</h3>
                  <p className="muted">
                    Approval: {gate.status === 'approved' ? 'Recorded' : 'Not recorded'}
                  </p>
                </div>
                <span
                  className={`gate-state ${gate.enabled && gate.status === 'approved' ? 'on' : 'off'}`}
                >
                  {gate.enabled && gate.status === 'approved' ? 'Enabled' : 'OFF'}
                </span>
              </div>
              {gate.status === 'approved' && (
                <p className="evidence-line">
                  Evidence: {gate.evidenceRef ?? 'Reference missing'}
                  {gate.approvedBy ? ` · approved by ${gate.approvedBy}` : ''}
                  {gate.approvedAt ? ` · ${new Date(gate.approvedAt).toLocaleDateString()}` : ''}
                </p>
              )}
              {canUpdate && !gate.enabled && (
                <div className="approval-fields">
                  <label>
                    Approval evidence reference
                    <input
                      value={evidence[gate.key] ?? ''}
                      onChange={(event) =>
                        setEvidence({ ...evidence, [gate.key]: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Reason for enabling
                    <input
                      value={reasons[gate.key] ?? ''}
                      onChange={(event) =>
                        setReasons({ ...reasons, [gate.key]: event.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={
                      !evidence[gate.key]?.trim() || !reasons[gate.key]?.trim() || Boolean(saving)
                    }
                    onClick={() => void enable(gate)}
                  >
                    {saving === gate.key ? 'Recording…' : 'Record approval & enable'}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {!canUpdate && (
        <p className="muted role-note">
          Read-only view. Only a super admin can record gate approval.
        </p>
      )}
    </section>
  );
}
