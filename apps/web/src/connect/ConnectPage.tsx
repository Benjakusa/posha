import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, TextArea } from '@posha/ui';
import type { PoshaApiClient } from '../api/client.js';
import { ConnectSafetySheet } from './ConnectSafetySheet.js';
import type { ConnectSafetyAction } from './ConnectSafetySheet.js';
import { createConnectSocket } from './realtime.js';
import type { ConnectClientSocket } from './realtime.js';

type ChatMessage = {
  id: string;
  body: string;
  from: string;
  mine: boolean;
  status?: 'sending' | 'sent' | 'failed';
};
type MatchFound = { sessionId: string; partner: { alias: string }; mode: 'text' | 'video' };

export function ConnectPage({
  accessToken,
  api,
  socketFactory = createConnectSocket,
  videoEnabled = false,
}: {
  accessToken: string;
  api: PoshaApiClient;
  socketFactory?: (accessToken: string) => ConnectClientSocket;
  videoEnabled?: boolean;
}) {
  const socketRef = useRef<ConnectClientSocket | null>(null);
  const nextRequested = useRef(false);
  const activeSessionId = useRef('');
  const leavingSession = useRef(false);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<'idle' | 'connecting' | 'queued' | 'matched'>('idle');
  const [position, setPosition] = useState<number | null>(null);
  const [partner, setPartner] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [safetyAction, setSafetyAction] = useState<ConnectSafetyAction | null>(null);
  const [mode, setMode] = useState<'text' | 'video'>('text');
  const [videoConsentSubmitted, setVideoConsentSubmitted] = useState(false);
  const [videoConsentAccepted, setVideoConsentAccepted] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = localStream;
    return () => localStream?.getTracks().forEach((track) => track.stop());
  }, [localStream]);

  useEffect(
    () => () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    },
    [],
  );

  function startQueue(queueMode: 'text' | 'video' = 'text') {
    setError('');
    setNotice('');
    setState('connecting');
    let socket: ConnectClientSocket;
    try {
      socket = socketFactory(accessToken);
    } catch {
      setState('idle');
      setError('Chat is unavailable. Check your connection and try again.');
      return;
    }
    socketRef.current = socket;
    socket.on('connect', () => {
      setState('queued');
      socket.emit('queue.join', { mode: queueMode, interests: [], lang: 'en' });
      socket.emit('heartbeat', {});
    });
    socket.on('connect_error', () => {
      setState('idle');
      setError('Chat could not connect. Please sign in again or try later.');
      socket.disconnect();
      socketRef.current = null;
    });
    socket.on('disconnect', (reason: string) => {
      if (socketRef.current !== socket || reason === 'io client disconnect') return;
      activeSessionId.current = '';
      socketRef.current = null;
      setSessionId('');
      setPartner('');
      setMessages([]);
      setVideoConsentAccepted(false);
      setVideoConsentSubmitted(false);
      setVideoReady(false);
      setLocalStream(null);
      setState('idle');
      setError('The connection was interrupted. Start a new chat when you are ready.');
    });
    socket.on('queue.state', (payload: { position?: number | null }) => {
      setState('queued');
      setPosition(payload.position ?? null);
    });
    socket.on('queue.left', () => {
      setState('idle');
      setPosition(null);
      socket.disconnect();
      socketRef.current = null;
    });
    socket.on('match.found', (payload: MatchFound) => {
      activeSessionId.current = payload.sessionId;
      setSessionId(payload.sessionId);
      setPartner(payload.partner.alias);
      setMode(payload.mode);
      setVideoConsentSubmitted(false);
      setVideoConsentAccepted(false);
      setVideoReady(false);
      setMessages([]);
      setState('matched');
      setPosition(null);
      setNotice(
        payload.mode === 'video'
          ? 'Review the video safety notice. Your camera stays off unless both people agree.'
          : 'You’re connected. Keep personal contact details private.',
      );
    });
    socket.on('video.consent.state', (payload: { sessionId: string; mutualAccepted: boolean }) => {
      if (payload.sessionId !== activeSessionId.current || !payload.mutualAccepted) return;
      setVideoConsentSubmitted(true);
      setVideoConsentAccepted(true);
      void api
        .getConnectVideoToken(accessToken, payload.sessionId)
        .then(() => setVideoReady(true))
        .catch(() => setError('Video setup is unavailable right now. You can leave this chat.'));
    });
    socket.on('chat.message', (payload: { id: string; from: string; body: string }) => {
      setMessages((current) => [
        ...current,
        { id: payload.id, body: payload.body, from: payload.from, mine: false },
      ]);
    });
    socket.on('chat.ack', (payload: { clientMsgId: string }) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === payload.clientMsgId ? { ...message, status: 'sent' } : message,
        ),
      );
    });
    socket.on(
      'session.ended',
      (payload: { sessionId: string; reason: 'next' | 'leave' | 'timeout' | 'block' }) => {
        if (payload.sessionId !== activeSessionId.current) return;
        activeSessionId.current = '';
        leavingSession.current = false;
        setSessionId('');
        setPartner('');
        setMessages([]);
        setLocalStream(null);
        if (nextRequested.current) {
          setState('queued');
          setNotice('Finding another conversation…');
        } else {
          setState('idle');
          setNotice(
            payload.reason === 'block'
              ? 'This conversation has ended.'
              : 'The conversation has ended.',
          );
          socket.disconnect();
          socketRef.current = null;
        }
        nextRequested.current = false;
      },
    );
    socket.on('safety.warning', (payload: { code: string }) => {
      const warning =
        payload.code === 'TEMPORARILY_MUTED'
          ? 'Chat is paused briefly because of rapid messages.'
          : 'That message was held for a safety review. Keep the chat respectful and non-explicit.';
      setNotice(warning);
      setMessages((current) => {
        const last = [...current]
          .reverse()
          .find((message) => message.mine && message.status === 'sending');
        return last
          ? current.map((message) =>
              message.id === last.id ? { ...message, status: 'failed' } : message,
            )
          : current;
      });
    });
    socket.on('error', (payload: { code: string }) => {
      nextRequested.current = false;
      const errors: Record<string, string> = {
        RATE_LIMITED: 'Please wait a moment before trying again.',
        SESSION_NOT_FOUND: 'That conversation has ended.',
        SERVICE_UNAVAILABLE: 'Chat is temporarily unavailable. Try again shortly.',
        AGE_LEVEL_REQUIRED: 'Complete the age check before using chat.',
      };
      setError(errors[payload.code] ?? 'The chat action could not be completed. Try again.');
    });
    socket.connect();
  }

  useEffect(() => {
    if (!socketRef.current || state === 'idle') return;
    const timer = window.setInterval(() => socketRef.current?.emit('heartbeat', {}), 5_000);
    return () => window.clearInterval(timer);
  }, [state]);

  function leaveQueue() {
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('queue.leave', {});
      setNotice('Leaving the queue…');
      return;
    }
    socket?.disconnect();
    socketRef.current = null;
    setState('idle');
    setPosition(null);
    setNotice('You left the queue.');
  }

  function leaveSession() {
    if (!sessionId || leavingSession.current) return;
    leavingSession.current = true;
    socketRef.current?.emit('session.leave', { sessionId });
    setNotice('Leaving the conversation…');
    window.setTimeout(() => {
      if (!leavingSession.current) return;
      leavingSession.current = false;
      activeSessionId.current = '';
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSessionId('');
      setPartner('');
      setMessages([]);
      setLocalStream(null);
      setState('idle');
      setNotice('You left the conversation.');
    }, 1_000);
  }

  function nextSession() {
    if (!sessionId) return;
    nextRequested.current = true;
    socketRef.current?.emit('session.next', { sessionId });
    setNotice('Finding another conversation…');
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !sessionId) return;
    const clientMsgId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: clientMsgId, body, from: 'You', mine: true, status: 'sending' },
    ]);
    setDraft('');
    socketRef.current?.emit('chat.send', { sessionId, body, clientMsgId });
  }

  function submitVideoConsent(accept: boolean) {
    if (!sessionId) return;
    if (accept) {
      setVideoConsentSubmitted(true);
      setNotice('Waiting for both people to agree before video can start…');
    } else setNotice('Declining video and ending this conversation…');
    socketRef.current?.emit('video.consent', { sessionId, accept });
  }

  async function enableCamera() {
    if (!sessionId || !videoReady) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera and microphone access is unavailable in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (activeSessionId.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setLocalStream(stream);
      setError('');
      setNotice('Camera preview is local to you. Live video is not available in this client yet.');
    } catch {
      setError(
        'Camera or microphone permission was not granted. You can leave this chat at any time.',
      );
    }
  }

  return (
    <section className="connect-page" aria-labelledby="connect-title">
      <p className="eyebrow">POSHA Connect{videoEnabled ? '' : ' · text only'}</p>
      <h1 id="connect-title">Connect with a verified adult</h1>
      {state === 'idle' ? (
        <div className="feature-card">
          <p>
            Start a private, non-explicit text conversation. You can leave, report, or block at any
            time.
          </p>
          <p className="fine-print">
            Keep contact details private. Respect boundaries. No explicit content.
          </p>
          <Button onClick={() => startQueue('text')}>Start text chat</Button>
          {videoEnabled ? (
            <Button variant="secondary" onClick={() => startQueue('video')}>
              Find video chat
            </Button>
          ) : null}
        </div>
      ) : null}
      {state === 'connecting' ? (
        <div className="connect-status" role="status">
          <p>Connecting securely…</p>
          <Button variant="secondary" onClick={leaveQueue}>
            Cancel
          </Button>
        </div>
      ) : null}
      {state === 'queued' ? (
        <div className="connect-status" role="status">
          <p>
            {position && position > 0
              ? `You’re in the queue (position ${position}).`
              : 'Finding a conversation…'}
          </p>
          <p className="fine-print">Your identity stays private until you choose what to share.</p>
          <Button onClick={leaveQueue} variant="secondary">
            Leave queue
          </Button>
        </div>
      ) : null}
      {state === 'matched' ? (
        <div
          className="connect-session"
          aria-label={mode === 'video' ? 'Video conversation' : 'Text conversation'}
        >
          <header className="connect-session__header">
            <div>
              <h2>{partner}</h2>
              <p>Verified adult · {mode === 'video' ? 'video chat' : 'text chat'}</p>
            </div>
            <div className="connect-session__actions">
              <Button
                disabled={leavingSession.current}
                onClick={() => setSafetyAction('report')}
                variant="secondary"
              >
                Report
              </Button>
              <Button
                disabled={leavingSession.current}
                onClick={() => setSafetyAction('block')}
                variant="danger"
              >
                Block
              </Button>
            </div>
          </header>
          {mode === 'video' && !videoConsentAccepted && !videoConsentSubmitted ? (
            <div className="feature-card" aria-label="Video consent">
              <p>
                Video is optional. Your camera and microphone stay off until both people accept. You
                can decline or leave at any time. Keep the conversation non-explicit and report
                anything that makes you uncomfortable.
              </p>
              <Button disabled={leavingSession.current} onClick={() => submitVideoConsent(true)}>
                Accept video
              </Button>
              <Button variant="secondary" onClick={() => submitVideoConsent(false)}>
                Decline video
              </Button>
            </div>
          ) : null}
          {mode === 'video' && videoConsentSubmitted && !videoConsentAccepted ? (
            <div className="connect-status" role="status">
              <p>Waiting for both people to agree before video can start…</p>
            </div>
          ) : null}
          {mode === 'video' && videoConsentAccepted ? (
            <div className="connect-status" role="status">
              <p>
                {videoReady
                  ? 'Both people agreed. Your camera and microphone remain off until you allow access.'
                  : 'Both people agreed. Preparing secure video room access…'}
              </p>
              {videoReady && !localStream ? (
                <Button onClick={() => void enableCamera()} disabled={leavingSession.current}>
                  Enable camera and microphone
                </Button>
              ) : null}
              {localStream ? (
                <>
                  <video
                    ref={previewRef}
                    autoPlay
                    muted
                    playsInline
                    aria-label="Your local camera preview"
                  />
                  <p className="fine-print">
                    Local preview only. Live video is not available in this client yet.
                  </p>
                  <Button variant="secondary" onClick={() => setLocalStream(null)}>
                    Turn off camera and microphone
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          {mode === 'text' ? (
            <ol className="connect-messages" aria-label="Messages" aria-live="polite">
              {messages.length === 0 ? (
                <li className="connect-empty">
                  Say hello. Keep the conversation respectful and non-explicit.
                </li>
              ) : null}
              {messages.map((message) => (
                <li
                  className={message.mine ? 'connect-message is-mine' : 'connect-message'}
                  key={message.id}
                >
                  <span className="connect-message__from">{message.from}</span>
                  <p>{message.body}</p>
                  {message.status === 'sending' ? (
                    <span className="connect-message__status">Sending…</span>
                  ) : null}
                  {message.status === 'failed' ? (
                    <span className="connect-message__status">Not sent</span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
          {mode === 'text' ? (
            <form className="connect-composer" onSubmit={sendMessage}>
              <TextArea
                aria-label="Your message"
                label="Message"
                maxLength={1000}
                onChange={(event) => setDraft(event.currentTarget.value)}
                value={draft}
              />
              <Button type="submit" disabled={!draft.trim() || leavingSession.current}>
                Send
              </Button>
            </form>
          ) : null}
          <div className="connect-session__footer">
            {mode === 'text' ? (
              <Button disabled={leavingSession.current} onClick={nextSession} variant="secondary">
                Next person
              </Button>
            ) : null}
            <Button disabled={leavingSession.current} onClick={leaveSession} variant="danger">
              Leave chat
            </Button>
          </div>
        </div>
      ) : null}
      {notice ? (
        <p className="connect-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {safetyAction && sessionId ? (
        <ConnectSafetySheet
          action={safetyAction}
          accessToken={accessToken}
          api={api}
          sessionId={sessionId}
          onClose={() => setSafetyAction(null)}
          onComplete={() => {
            setSafetyAction(null);
            setNotice(
              safetyAction === 'report'
                ? 'Your report was sent to the safety team.'
                : 'This person was blocked.',
            );
          }}
        />
      ) : null}
    </section>
  );
}
