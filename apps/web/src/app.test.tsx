import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api/client.js';
import type { PoshaApiClient } from './api/client.js';
import { WebRoutes } from './app.js';

function fakeApi(overrides: Partial<PoshaApiClient> = {}): PoshaApiClient {
  return {
    getCatalogHome: vi.fn().mockResolvedValue({
      lives: [
        {
          id: 'live-1',
          title: 'Tea and stories',
          startsAt: '2030-01-01T00:00:00.000Z',
          creator: { id: 'creator-1', displayName: 'Amara' },
        },
      ],
      videos: [
        {
          id: 'video-1',
          title: 'Sunday reset',
          durationSec: 240,
          locked: true,
          priceMinor: 30000,
          creator: { id: 'creator-1', displayName: 'Amara' },
          placeholderUrl: '/api/v1/catalog/media/video-1/black-placeholder',
        },
      ],
    }),
    createGuestSession: vi.fn().mockResolvedValue({
      accessToken: 'guest-access-token',
      tokenType: 'Bearer',
      expiresAt: '2030-01-01T00:00:00.000Z',
      alias: 'Amber Fox',
    }),
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
    getConnectVideoToken: vi.fn().mockResolvedValue({
      url: 'wss://video.example.test',
      token: 'video-token',
      expiresAt: '2030-01-01T00:01:00.000Z',
    }),
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

async function confirmAgeWithKeyboard(user: ReturnType<typeof userEvent.setup>) {
  await user.tab();
  await user.keyboard('{Enter}');
}

async function signInThroughOtp(api: PoshaApiClient) {
  const user = userEvent.setup();
  localStorage.setItem('posha:adult-confirmed', 'true');
  localStorage.setItem(
    'posha:guest-session',
    JSON.stringify({
      accessToken: 'guest-access-token',
      tokenType: 'Bearer',
      expiresAt: '2030-01-01T00:00:00.000Z',
      alias: 'Amber Fox',
    }),
  );
  sessionStorage.setItem('posha:creator-auth-intent', 'true');
  renderAt('/auth/identity', api);
  await screen.findByRole('heading', { name: 'Sign in' });
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

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(cleanup);

describe('POSHA web shell', () => {
  it('[B-S3-03] requires a guest session before opening protected app routes', async () => {
    renderAt('/auth/identity', fakeApi());
    expect(await screen.findByRole('heading', { name: /Adults only/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'I am 18 or older. Enter POSHA' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });

  it('[B-S3-03] creates a guest session from the accessible age gate without OTP', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    renderAt('/', api);
    await confirmAgeWithKeyboard(user);
    expect(
      await screen.findByRole('heading', { name: 'Meet someone new. Fall for the moment.' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start text chat' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Profile' }).length).toBeGreaterThan(0);
    expect(api.createGuestSession).toHaveBeenCalledOnce();
    expect(api.requestOtp).not.toHaveBeenCalled();
  });

  it('shows the guest-session failure reason and logs safe dev diagnostics', async () => {
    const user = userEvent.setup();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = fakeApi({
      createGuestSession: vi
        .fn()
        .mockRejectedValue(new ApiRequestError('Please wait a moment before trying again.', 429)),
    });
    renderAt('/', api);
    await confirmAgeWithKeyboard(user);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Please wait a moment before trying again.',
    );
    expect(log).toHaveBeenCalledWith(
      '[POSHA] Guest session request failed',
      expect.objectContaining({
        status: 429,
        message: 'Please wait a moment before trying again.',
        apiBaseUrl: '(same-origin Vite proxy)',
        networkError: undefined,
      }),
    );
  });

  it('keeps the browser network failure detail for development diagnostics', async () => {
    const user = userEvent.setup();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = fakeApi({
      createGuestSession: vi
        .fn()
        .mockRejectedValue(
          new ApiRequestError(
            'The service could not be reached. Check your connection and try again.',
            0,
            new TypeError('Failed to fetch'),
          ),
        ),
    });
    renderAt('/', api);
    await confirmAgeWithKeyboard(user);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The service could not be reached.',
    );
    expect(log).toHaveBeenCalledWith(
      '[POSHA] Guest session request failed',
      expect.objectContaining({
        status: 0,
        networkError: { name: 'TypeError', message: 'Failed to fetch' },
      }),
    );
  });

  it('[B-S3-03] supports slide-to-enter pointer confirmation', async () => {
    const api = fakeApi();
    renderAt('/', api);
    const track = screen.getByRole('button', { name: 'I am 18 or older. Enter POSHA' });
    track.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 56,
      width: 300,
      height: 56,
      toJSON: () => ({}),
    });
    const pointer = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        clientX: { value: clientX },
        pointerId: { value: 1 },
      });
      fireEvent(track, event);
    };
    pointer('pointerdown', 28);
    pointer('pointermove', 250);
    pointer('pointerup', 250);
    expect(
      await screen.findByRole('heading', { name: 'Meet someone new. Fall for the moment.' }),
    ).toBeTruthy();
    expect(api.createGuestSession).toHaveBeenCalledOnce();
  });

  it('remembers the 18+ confirmation after the app is reopened', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    renderAt('/', api);
    await confirmAgeWithKeyboard(user);
    expect(
      await screen.findByRole('heading', { name: 'Meet someone new. Fall for the moment.' }),
    ).toBeTruthy();
    cleanup();

    renderAt('/', api);
    expect(
      await screen.findByRole('heading', { name: 'Meet someone new. Fall for the moment.' }),
    ).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'I confirm that I am 18 or older' })).toBeNull();
  });

  it('keeps the guest homepage accessible', async () => {
    localStorage.setItem('posha:adult-confirmed', 'true');
    localStorage.setItem(
      'posha:guest-session',
      JSON.stringify({
        accessToken: 'guest-access-token',
        tokenType: 'Bearer',
        expiresAt: '2030-01-01T00:00:00.000Z',
        alias: 'Amber Fox',
      }),
    );
    const { container } = renderAt('/home', fakeApi());
    expect(
      await screen.findByRole('heading', { name: 'Meet someone new. Fall for the moment.' }),
    ).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Live soon' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Latest videos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Subscribe KSh/ })).toBeTruthy();
    expect(container.querySelector('.catalog-video')?.getAttribute('class')).toContain('is-locked');
    expect(container.querySelector('.catalog-video img')).toBeNull();
    const results = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
        'label-content-name-mismatch': { enabled: false },
      },
    });
    expect(results.violations).toEqual([]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    const lightResults = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
        'label-content-name-mismatch': { enabled: false },
      },
    });
    expect(lightResults.violations).toEqual([]);
  });

  it('shows the creator profile area for guests and routes creator entry through account creation', async () => {
    localStorage.setItem('posha:adult-confirmed', 'true');
    localStorage.setItem(
      'posha:guest-session',
      JSON.stringify({
        accessToken: 'guest-access-token',
        tokenType: 'Bearer',
        expiresAt: '2030-01-01T00:00:00.000Z',
        alias: 'Amber Fox',
      }),
    );
    const user = userEvent.setup();
    const { container } = renderAt('/profile', fakeApi());
    expect(
      await screen.findByRole('heading', { name: 'Share your world. Earn from your fans.' }),
    ).toBeTruthy();
    expect(screen.getByText('Amber Fox')).toBeTruthy();
    const accessibility = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(accessibility.violations).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Become a creator' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });

  it('keeps OTP sign-in behind the creator entry point', async () => {
    renderAt('/auth/identity', fakeApi());
    expect(await screen.findByRole('heading', { name: /Adults only/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });

  it('[P1-07] keeps member routes behind authentication and verified adult status', () => {
    renderAt('/home', fakeApi());
    expect(screen.getByRole('heading', { name: /Adults only/ })).toBeTruthy();
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
    expect(
      await screen.findByRole('heading', { name: 'Meet someone new. Fall for the moment.' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start text chat' })).toBeTruthy();
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(navigation.querySelectorAll('a')).toHaveLength(5);
    expect(screen.getByRole('link', { name: /Home/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Discover/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Live/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Chats/ })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Profile/ }).length).toBeGreaterThan(0);
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

  it('[B-S3-03] age gate passes axe checks in both themes', async () => {
    for (const theme of ['dark', 'light']) {
      localStorage.setItem('posha:theme', theme);
      const { container, unmount } = renderAt('/', fakeApi());
      const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
      expect(results.violations, theme).toEqual([]);
      unmount();
      localStorage.removeItem('posha:theme');
    }
  });
});
