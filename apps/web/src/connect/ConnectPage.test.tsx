import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoshaApiClient } from '../api/client.js';
import type { ConnectClientSocket } from './realtime.js';
import { ConnectPage } from './ConnectPage.js';

class FakeSocket {
  handlers = new Map<string, ((payload?: never) => void)[]>();
  emissions: { event: string; payload: unknown }[] = [];
  connected = false;
  on(event: string, handler: (payload?: never) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  emit(event: string, payload: unknown) {
    this.emissions.push({ event, payload });
    return this;
  }
  connect() {
    this.connected = true;
    this.fire('connect');
    return this;
  }
  disconnect() {
    this.connected = false;
    this.fire('disconnect');
    return this;
  }
  fire(event: string, payload?: unknown) {
    for (const handler of this.handlers.get(event) ?? []) handler(payload as never);
  }
}

const api = {
  reportConnectSession: vi.fn(),
  blockConnectSession: vi.fn(),
  getConnectVideoToken: vi.fn().mockResolvedValue({
    url: 'wss://video.example.test',
    token: 'video-token',
    expiresAt: '2030-01-01T00:01:00.000Z',
  }),
} as unknown as PoshaApiClient;
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('Connect chat flow (P2-06)', () => {
  it('waits for mutual video consent before requesting room access', async () => {
    const socket = new FakeSocket();
    const user = userEvent.setup();
    const videoApi = {
      ...api,
      getConnectVideoToken: vi.fn().mockResolvedValue({
        url: 'wss://video.example.test',
        token: 'video-token',
        expiresAt: '2030-01-01T00:01:00.000Z',
      }),
    } as unknown as PoshaApiClient;
    render(
      <MemoryRouter>
        <ConnectPage
          accessToken="access-token"
          api={videoApi}
          videoEnabled
          initialMode="video"
          socketFactory={() => socket as unknown as ConnectClientSocket}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Find a video chat' }));
    expect(socket.emissions).toContainEqual({
      event: 'queue.join',
      payload: { mode: 'video', interests: [], lang: 'en' },
    });
    act(() =>
      socket.fire('match.found', {
        sessionId: 'video-session',
        partner: { alias: 'RiverStone' },
        mode: 'video',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Accept video' }));
    expect(socket.emissions.at(-1)).toEqual({
      event: 'video.consent',
      payload: { sessionId: 'video-session', accept: true },
    });
    expect(videoApi.getConnectVideoToken).not.toHaveBeenCalled();
    act(() =>
      socket.fire('video.consent.state', {
        sessionId: 'video-session',
        mutualAccepted: true,
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Enable camera and microphone' }),
    ).toBeTruthy();
    expect(videoApi.getConnectVideoToken).toHaveBeenCalledWith('access-token', 'video-session');
    act(() =>
      socket.fire('video.limit_reached', { sessionId: 'video-session', limitSeconds: 120 }),
    );
    expect(await screen.findByRole('dialog', { name: 'Your 2 minutes are up' })).toBeTruthy();
  });

  it('joins the text queue, relays chat, handles Next and ignores stale session end events', async () => {
    const socket = new FakeSocket();
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <ConnectPage
          accessToken="access-token"
          api={api}
          socketFactory={() => socket as unknown as ConnectClientSocket}
        />
      </MemoryRouter>,
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Start chatting' }),
    );
    expect(socket.emissions).toContainEqual({
      event: 'queue.join',
      payload: { mode: 'text', interests: [], lang: 'en' },
    });
    act(() => socket.fire('queue.state', { position: 1 }));
    expect(await screen.findByText(/position 1/)).toBeTruthy();
    socket.fire('match.found', {
      sessionId: 'session-1',
      partner: { alias: 'RiverStone' },
      mode: 'text',
    });
    expect(await screen.findByRole('heading', { name: 'RiverStone' })).toBeTruthy();
    const accessibility = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(accessibility.violations).toEqual([]);
    await user.type(screen.getByRole('textbox', { name: 'Your message' }), 'Hello there');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(socket.emissions.at(-1)).toMatchObject({
      event: 'chat.send',
      payload: { sessionId: 'session-1', body: 'Hello there' },
    });
    const outgoing = socket.emissions.at(-1)?.payload as { clientMsgId: string };
    act(() => socket.fire('chat.ack', { clientMsgId: outgoing.clientMsgId }));
    act(() =>
      socket.fire('chat.message', { id: 'incoming-1', from: 'RiverStone', body: 'Good morning' }),
    );
    expect(await screen.findByText('Good morning')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next stranger' }));
    expect(socket.emissions.at(-1)).toEqual({
      event: 'session.next',
      payload: { sessionId: 'session-1' },
    });
    act(() =>
      socket.fire('match.found', {
        sessionId: 'session-2',
        partner: { alias: 'KindCloud' },
        mode: 'text',
      }),
    );
    act(() => socket.fire('session.ended', { sessionId: 'session-1', reason: 'next' }));
    expect(screen.getByRole('heading', { name: 'KindCloud' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave chat' })).toBeTruthy();
  });

  it('leaves the queue and displays connection failures with neutral copy', async () => {
    const socket = new FakeSocket();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ConnectPage
          accessToken="access-token"
          api={api}
          socketFactory={() => socket as unknown as ConnectClientSocket}
        />
      </MemoryRouter>,
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Start chatting' }),
    );
    await user.click(screen.getByRole('button', { name: 'Leave queue' }));
    expect(socket.emissions).toContainEqual({ event: 'queue.leave', payload: {} });
    act(() => socket.fire('queue.left', {}));
    await user.click(screen.getByRole('button', { name: 'Start chatting' }));
    act(() => socket.fire('connect_error'));
    expect((await screen.findByRole('alert')).textContent).toContain('Chat could not connect');
  });
});
