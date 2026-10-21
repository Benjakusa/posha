import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api/client.js';
import type { PoshaApiClient } from './api/client.js';
import { WebRoutes } from './app.js';

function fakeApi(overrides: Partial<PoshaApiClient> = {}): PoshaApiClient {
  return {
    requestOtp: vi.fn().mockResolvedValue(undefined),
    verifyOtp: vi.fn().mockResolvedValue({ accessToken: 'session-access-token' }),
    getAgeStatus: vi.fn().mockResolvedValue({
      status: 'not_started',
      level: 'L0',
      appealAvailable: false,
      reviewPending: false,
      expiresAt: null,
    }),
    startAgeCheck: vi
      .fn()
      .mockResolvedValue({ sessionUrl: 'https://age.example.test/check', status: 'pending' }),
    updatePreferences: vi.fn().mockResolvedValue(undefined),
    requestDataExport: vi.fn().mockResolvedValue(undefined),
    requestDeletion: vi.fn().mockResolvedValue(undefined),
    reportConnectSession: vi.fn().mockResolvedValue({ reportId: 'report-id', status: 'open' }),
    blockConnectSession: vi.fn().mockResolvedValue({ blocked: true }),
    ...overrides,
  };
}

function renderAt(path: string, api: PoshaApiClient) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WebRoutes api={api} />
    </MemoryRouter>,
  );
}

async function signInThroughOtp(api: PoshaApiClient) {
  const user = userEvent.setup();
  renderAt('/auth/identity', api);
  await user.type(
    screen.getByRole('textbox', { name: 'Email or phone number' }),
    'adult@example.test',
  );
  await user.click(screen.getByRole('button', { name: 'Send one-time code' }));
  await screen.findByRole('heading', { name: 'Enter your one-time code' });
  await user.type(screen.getByRole('textbox', { name: 'Six-digit code' }), '123456');
  await user.click(screen.getByRole('button', { name: 'Verify code' }));
  return user;
}

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe('POSHA web shell', () => {
  it('[P1-07] keeps member routes behind authentication and verified adult status', () => {
    renderAt('/home', fakeApi());
    expect(screen.getByRole('heading', { name: 'Find a friendly conversation.' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it('[P1-07] completes OTP, age, alias, and safety onboarding into the five-tab shell', async () => {
    const api = fakeApi({
      getAgeStatus: vi.fn().mockResolvedValue({
        status: 'passed',
        level: 'L2',
        appealAvailable: false,
        reviewPending: false,
        expiresAt: null,
      }),
    });
    const user = await signInThroughOtp(api);
    expect(await screen.findByRole('heading', { name: 'Choose a chat identity' })).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: 'Chat name' }), 'Test Member');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'A few safety basics' })).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: 'I understand these safety rules' }));
    await user.click(screen.getByRole('button', { name: 'Go to POSHA' }));
    expect(await screen.findByRole('heading', { name: 'Welcome to POSHA' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start text chat' })).toBeTruthy();
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(navigation.querySelectorAll('a')).toHaveLength(5);
    expect(screen.getByRole('link', { name: /Home/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Discover/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Live/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Chats/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Profile/ })).toBeTruthy();
    expect(api.requestOtp).toHaveBeenCalledWith('adult@example.test');
    expect(api.verifyOtp).toHaveBeenCalledWith('adult@example.test', '123456');
  });

  it('[P1-07] never unlocks member areas when age assurance is pending or denied', async () => {
    const api = fakeApi({
      getAgeStatus: vi.fn().mockResolvedValue({
        status: 'failed',
        level: 'L0',
        appealAvailable: true,
        reviewPending: false,
        expiresAt: null,
      }),
      startAgeCheck: vi
        .fn()
        .mockRejectedValue(
          new ApiRequestError('This verification option is not available yet.', 403),
        ),
    });
    const user = await signInThroughOtp(api);
    expect(await screen.findByRole('heading', { name: 'Verify you’re an adult' })).toBeTruthy();
    expect(screen.getByText(/contact support to request a review/i)).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Continue to secure age check' }));
    expect(await screen.findByText('This verification option is not available yet.')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it('[P1-07] opens provider verification separately and rechecks age status before unlocking', async () => {
    const getAgeStatus = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'not_started',
        level: 'L0',
        appealAvailable: false,
        reviewPending: false,
        expiresAt: null,
      })
      .mockResolvedValueOnce({
        status: 'not_started',
        level: 'L0',
        appealAvailable: false,
        reviewPending: false,
        expiresAt: null,
      })
      .mockResolvedValueOnce({
        status: 'passed',
        level: 'L2',
        appealAvailable: false,
        reviewPending: false,
        expiresAt: null,
      });
    const api = fakeApi({ getAgeStatus });
    const user = await signInThroughOtp(api);
    expect(await screen.findByRole('heading', { name: 'Verify you’re an adult' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Continue to secure age check' }));
    const providerLink = await screen.findByRole('link', { name: 'Open secure age check' });
    expect(providerLink.getAttribute('href')).toBe('https://age.example.test/check');
    expect(providerLink.getAttribute('target')).toBe('_blank');
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Refresh verification status' }));
    expect(await screen.findByRole('heading', { name: 'Choose a chat identity' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });

  it('[P1-07] has no automated accessibility violations on the welcome route', async () => {
    const { container } = renderAt('/welcome', fakeApi());
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
