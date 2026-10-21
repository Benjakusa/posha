import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminApi,
  AuditRecord,
  GateRecord,
  ModerationAppeal,
  ModerationReport,
  StaffSession,
} from './admin-api.js';
import { AdminApp } from './app.js';

const gates: GateRecord[] = [
  {
    key: 'GATE:LIVE',
    enabled: false,
    status: 'blocked',
    evidenceRef: null,
    approvedBy: null,
    approvedAt: null,
  },
  {
    key: 'GATE:RANDOM_VIDEO',
    enabled: false,
    status: 'blocked',
    evidenceRef: null,
    approvedBy: null,
    approvedAt: null,
  },
];

const auditRecords: AuditRecord[] = [
  {
    id: 'audit-1',
    occurredAt: '2026-10-20T08:30:00.000Z',
    actorRole: 'super_admin',
    action: 'gate.approval_requested',
    entityType: 'compliance_gate',
    entityReference: 'GATE:LIVE',
    reason: 'Launch review complete',
  },
];
const reports: ModerationReport[] = [
  {
    id: 'report-review',
    target: 'ref-a',
    targetType: 'session',
    reasonCode: 'spam_contact',
    status: 'open',
    priority: 'review',
    createdAt: '2026-10-20T08:30:00.000Z',
    evidenceAvailable: false,
  },
  {
    id: 'report-urgent',
    target: 'ref-b',
    targetType: 'message',
    reasonCode: 'threat',
    status: 'open',
    priority: 'urgent',
    createdAt: '2026-10-20T08:31:00.000Z',
    evidenceAvailable: true,
  },
];
const appeals: ModerationAppeal[] = [
  {
    id: 'appeal-1',
    action: 'ban',
    target: 'ref-c',
    createdAt: '2026-10-20T08:32:00.000Z',
    reason: 'I believe this was a mistake.',
    originalReviewer: 'staff-mod',
    permanent: true,
  },
];

function makeApi(session: StaffSession | null, overrides: Partial<AdminApi> = {}): AdminApi {
  return {
    getSession: vi.fn().mockResolvedValue(session),
    beginSso: vi.fn().mockResolvedValue(undefined),
    verifyMfa: vi.fn().mockResolvedValue(session),
    getAuditLog: vi.fn().mockResolvedValue(auditRecords),
    getGates: vi.fn().mockResolvedValue(gates),
    enableGate: vi.fn().mockResolvedValue(undefined),
    getReports: vi.fn().mockResolvedValue(reports),
    takeModerationAction: vi.fn().mockResolvedValue(undefined),
    getAppeals: vi.fn().mockResolvedValue(appeals),
    decideAppeal: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const superAdmin: StaffSession = {
  subject: 'staff-1',
  displayName: 'Alex Admin',
  roles: ['super_admin'],
  mfaVerified: true,
};
const compliance: StaffSession = {
  subject: 'staff-2',
  displayName: 'Cory Compliance',
  roles: ['compliance_officer'],
  mfaVerified: true,
};
const moderator: StaffSession = {
  subject: 'staff-mod',
  displayName: 'Mina Moderator',
  roles: ['moderator'],
  mfaVerified: true,
};

afterEach(cleanup);

describe('admin shell RBAC (ADM-01)', () => {
  it('requires a verified MFA session before showing admin tools', async () => {
    render(<AdminApp api={makeApi({ ...superAdmin, mfaVerified: false })} />);
    expect(await screen.findByRole('heading', { name: 'Admin workspace' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Admin navigation' })).toBeNull();
  });

  it('shows audit and gates read-only to compliance and hides finance tools', async () => {
    render(<AdminApp api={makeApi(compliance)} />);
    expect(await screen.findByRole('heading', { name: 'Welcome, Cory Compliance' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Audit log' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Flags & gates' })).toBeTruthy();
    expect(screen.queryByText('Refunds & payouts')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Flags & gates' }));
    expect(
      await screen.findByText('Read-only view. Only a super admin can record gate approval.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record approval & enable' })).toBeNull();
  });

  it('shows redacted audit details to a compliance officer', async () => {
    render(<AdminApp api={makeApi(compliance)} />);
    await screen.findByRole('heading', { name: 'Welcome, Cory Compliance' });
    fireEvent.click(screen.getByRole('button', { name: 'Audit log' }));
    expect(await screen.findByText('gate.approval_requested')).toBeTruthy();
    expect(screen.getByText('Launch review complete')).toBeTruthy();
  });
});

describe('gate controls (ADM-04)', () => {
  it('requires evidence and reason, then submits both to the API', async () => {
    const enableGate = vi.fn().mockResolvedValue(undefined);
    const api = makeApi(superAdmin, { enableGate });
    render(<AdminApp api={api} />);
    await screen.findByRole('heading', { name: 'Welcome, Alex Admin' });
    fireEvent.click(screen.getByRole('button', { name: 'Flags & gates' }));
    const liveGate = await screen.findByRole('heading', { name: 'GATE:LIVE' });
    const card = liveGate.closest('article');
    if (!card) throw new Error('Gate card not rendered');
    const scoped = within(card);
    const submit = scoped.getByRole('button', {
      name: 'Record approval & enable',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const inputs = scoped.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: 'APP-2026-18' } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(inputs[1]!, { target: { value: 'Compliance review approved' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() =>
      expect(enableGate).toHaveBeenCalledWith('GATE:LIVE', {
        evidenceRef: 'APP-2026-18',
        reason: 'Compliance review approved',
      }),
    );
    expect(gates.every((gate) => !gate.enabled)).toBe(true);
  });

  it('never treats a gate as enabled unless both enabled and approved are returned', async () => {
    const api = makeApi(superAdmin, {
      getGates: vi.fn().mockResolvedValue([{ ...gates[0]!, enabled: true }]),
    });
    render(<AdminApp api={api} />);
    await screen.findByRole('heading', { name: 'Welcome, Alex Admin' });
    fireEvent.click(screen.getByRole('button', { name: 'Flags & gates' }));
    expect(await screen.findByText('OFF')).toBeTruthy();
  });

  it('renders the admin sign-in page without automated accessibility violations', async () => {
    const { container } = render(<AdminApp api={makeApi(null)} />);
    await screen.findByRole('heading', { name: 'Admin workspace' });
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});

describe('moderation queue (P2-07)', () => {
  it('prioritizes urgent reports and requires a reason and duration for a mute', async () => {
    const takeModerationAction = vi.fn().mockResolvedValue(undefined);
    render(<AdminApp api={makeApi(moderator, { takeModerationAction })} />);
    await screen.findByRole('heading', { name: 'Welcome, Mina Moderator' });
    fireEvent.click(screen.getByRole('button', { name: 'Reports & appeals' }));
    const urgent = await screen.findByText('threat · message');
    const review = screen.getByText('spam contact · session');
    expect(urgent.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const muteSelect = screen.getAllByLabelText('Action')[0] as HTMLSelectElement;
    fireEvent.change(muteSelect, { target: { value: 'mute' } });
    const reasonBoxes = screen.getAllByLabelText('Reason');
    fireEvent.change(reasonBoxes[0]!, { target: { value: 'Repeated threats' } });
    const record = screen.getAllByRole('button', { name: 'Record action' })[0] as HTMLButtonElement;
    expect(record.disabled).toBe(true);
    fireEvent.change(screen.getAllByLabelText('Expires at')[0]!, {
      target: { value: '2026-10-22T10:00' },
    });
    expect(record.disabled).toBe(false);
    fireEvent.click(record);
    await waitFor(() =>
      expect(takeModerationAction).toHaveBeenCalledWith('report-urgent', {
        action: 'mute',
        reason: 'Repeated threats',
        expiresAt: expect.any(String),
      }),
    );
  });

  it('keeps support read-only and requires an independent reviewer for a permanent ban appeal', async () => {
    const support: StaffSession = { ...compliance, roles: ['support_agent'] };
    const api = makeApi(support);
    render(<AdminApp api={api} />);
    await screen.findByRole('heading', { name: 'Welcome, Cory Compliance' });
    fireEvent.click(screen.getByRole('button', { name: 'Reports & appeals' }));
    expect(
      await screen.findAllByText('Read-only. A moderator must review and act on this report.'),
    ).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Record action' })).toBeNull();

    cleanup();
    const decideAppeal = vi.fn();
    render(<AdminApp api={makeApi(moderator, { decideAppeal })} />);
    await screen.findByRole('heading', { name: 'Welcome, Mina Moderator' });
    fireEvent.click(screen.getByRole('button', { name: 'Reports & appeals' }));
    expect(
      await screen.findByText('A different moderator must decide this permanent-action appeal.'),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Accept appeal' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
