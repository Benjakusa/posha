/* global __ENV, __VU */
import ws from 'k6/ws';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const users = Number(__ENV.CONNECT_USERS || '200');
if (!__ENV.CONNECT_TOKENS_FILE) throw new Error('CONNECT_TOKENS_FILE is required');
const tokens = JSON.parse(open(__ENV.CONNECT_TOKENS_FILE));
if (!Array.isArray(tokens)) throw new Error('CONNECT_TOKENS_FILE must contain a JSON array');
const tokenValues = tokens.map((entry) =>
  typeof entry === 'string'
    ? entry
    : entry && typeof entry.accessToken === 'string'
      ? entry.accessToken
      : '',
);
const uniqueTokens = new Set(tokenValues);
if (![200, 1000].includes(users)) throw new Error('CONNECT_USERS must be 200 or 1000');
if (
  tokenValues.length < users ||
  uniqueTokens.size < users ||
  tokenValues.slice(0, users).some((t) => !t)
) {
  throw new Error(`CONNECT_TOKENS_FILE must contain ${users} unique access tokens`);
}

const matchWaitMs = new Trend('connect_match_wait_ms', true);
const matchSuccess = new Rate('connect_match_success');
const matches = new Counter('connect_matches');
const loadErrors = new Counter('connect_load_errors');
const maxWaitMs = Number(__ENV.MATCH_TIMEOUT_MS || '120000');
const baseUrl = __ENV.API_URL;
if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  throw new Error('API_URL must be the HTTP(S) origin of the dedicated test API');
}
const wsBaseUrl = baseUrl.replace(/^http/, 'ws').replace(/\/$/, '');
const socketUrl = `${wsBaseUrl}/socket.io/?EIO=4&transport=websocket`;

export const options = {
  scenarios: {
    connect_matching: {
      executor: 'per-vu-iterations',
      vus: users,
      iterations: 1,
      maxDuration: '3m',
      gracefulStop: '10s',
      exec: 'queueAndMeasure',
    },
  },
  thresholds: {
    connect_match_wait_ms: ['p(95)<10000'],
    connect_match_success: ['rate>0.99'],
    connect_load_errors: ['count==0'],
  },
};

export function queueAndMeasure() {
  const token = tokenValues[__VU - 1];
  let joinedAt = 0;
  let matched = false;
  let leaving = false;
  let finished = false;
  let currentSessionId = '';

  function recordResult(success) {
    if (finished) return;
    finished = true;
    matchSuccess.add(success);
    if (!success) loadErrors.add(1);
  }

  function finish(socket, success) {
    recordResult(success);
    socket.close();
  }

  const response = ws.connect(socketUrl, {}, (socket) => {
    socket.on('message', (raw) => {
      const message = String(raw);
      if (message === '2') {
        socket.send('3');
        return;
      }
      if (message.startsWith('0')) {
        socket.send(`40/connect,${JSON.stringify({ token })}`);
        return;
      }
      if (message.startsWith('44/connect,')) {
        finish(socket, false);
        return;
      }
      if (message.startsWith('40/connect,')) {
        joinedAt = Date.now();
        socket.send('42/connect,["queue.join",{"mode":"text","interests":[],"lang":"en"}]');
        return;
      }
      if (!message.startsWith('42/connect,')) return;

      let event;
      try {
        event = JSON.parse(message.slice('42/connect,'.length));
      } catch {
        loadErrors.add(1);
        finish(socket, false);
        return;
      }
      if (!Array.isArray(event) || typeof event[0] !== 'string') return;
      if (event[0] === 'error' || event[0] === 'safety.warning') {
        finish(socket, false);
      } else if (event[0] === 'match.found' && !matched) {
        const payload = event[1] || {};
        if (!payload.sessionId || !payload.partner || !payload.partner.alias) {
          finish(socket, false);
          return;
        }
        matched = true;
        currentSessionId = payload.sessionId;
        matchWaitMs.add(Date.now() - joinedAt);
        matches.add(1);
        leaving = true;
        socket.send(
          `42/connect,["session.leave",${JSON.stringify({ sessionId: currentSessionId })}]`,
        );
      } else if (event[0] === 'session.ended' && leaving) {
        finish(socket, matched);
      }
    });

    socket.on('error', () => finish(socket, false));
    socket.on('close', () => {
      recordResult(matched);
    });
    socket.setTimeout(() => finish(socket, false), maxWaitMs + 10_000);
  });

  check(response, { 'Socket.IO WebSocket upgraded': (res) => res && res.status === 101 });
  if (!response || response.status !== 101) {
    loadErrors.add(1);
    matchSuccess.add(false);
  }
}
