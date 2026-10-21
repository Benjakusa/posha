import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoshaApiClient } from '../api/client.js';
import { ConnectSafetySheet } from './ConnectSafetySheet.js';

const api = {
  reportConnectSession: vi.fn().mockResolvedValue({ reportId: 'report-id', status: 'open' }),
  blockConnectSession: vi.fn().mockResolvedValue({ blocked: true }),
} as unknown as PoshaApiClient;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Connect safety sheets (P2-05)', () => {
  it('asks for consent before capturing the message snapshot and passes axe', async () => {
    const onComplete = vi.fn();
    const { container } = render(
      <ConnectSafetySheet
        action="report"
        accessToken="token"
        api={api}
        sessionId="session-id"
        onClose={vi.fn()}
        onComplete={onComplete}
      />,
    );
    expect(
      (screen.getByRole('checkbox', { name: 'Include recent chat messages' }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Include recent chat messages' }));
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(api.reportConnectSession).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ snapshotConsent: true }),
      expect.any(String),
    );
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('requires an explicit block confirmation and targets the session server-side', async () => {
    render(
      <ConnectSafetySheet
        action="block"
        accessToken="token"
        api={api}
        sessionId="session-id"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Block person' }));
    expect(api.blockConnectSession).toHaveBeenCalledWith('token', 'session-id');
  });
});
