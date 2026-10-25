import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import {
  Button,
  Chip,
  ChevronLeft,
  Camera,
  Heart,
  Send,
  Shield,
  TextArea,
  Video,
  X,
} from '@posha/ui';
import type { PoshaApiClient } from '../api/client.js';
import { ConnectSafetySheet } from './ConnectSafetySheet.js';
import type { ConnectSafetyAction } from './ConnectSafetySheet.js';
import { createConnectSocket } from './realtime.js';
import type { ConnectClientSocket } from './realtime.js';
import { useNavigate } from 'react-router';

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
  initialMode = 'text',
}: {
  accessToken: string;
  api: PoshaApiClient;
  socketFactory?: (accessToken: string) => ConnectClientSocket;
  videoEnabled?: boolean;
  initialMode?: 'text' | 'video';
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
  const [mode, setMode] = useState<'text' | 'video'>(initialMode);
  const [preChatOpen, setPreChatOpen] = useState(
    () => sessionStorage.getItem('posha:connect-safety-seen') !== 'true',
  );
  const [interests, setInterests] = useState<string[]>([]);
  const [videoConsentSubmitted, setVideoConsentSubmitted] = useState(false);
  const [videoConsentAccepted, setVideoConsentAccepted] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [timeLimitOpen, setTimeLimitOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = localStream;
    return () => localStream?.getTracks().forEach((track) => track.stop());
  }, [localStream]);

  useEffect(() => {
    if (!localStream || !videoReady || mode !== 'video' || !sessionId) return;
    let sampling = false;
    const timer = window.setInterval(() => {
      const video = previewRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0 || sampling) return;
      sampling = true;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameBase64 = canvas
          .toDataURL('image/jpeg', 0.25)
          .slice('data:image/jpeg;base64,'.length);
        if (frameBase64.length <= 6_400)
          socketRef.current?.emit('video.frame', { sessionId, frameBase64 });
      } catch {
        // Sampling failures leave the local preview and call controls available.
      } finally {
        sampling = false;
      }
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [localStream, videoReady, mode, sessionId]);

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
      socket.emit('queue.join', { mode: queueMode, interests, lang: 'en' });
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
      setSecondsLeft(120);
      void api
        .getConnectVideoToken(accessToken, payload.sessionId)
        .then(() => setVideoReady(true))
        .catch(() => setError('Video setup is unavailable right now. You can leave this chat.'));
    });
    socket.on('video.limit_reached', (payload: { sessionId?: string; limitSeconds?: number }) => {
      if (payload.sessionId && payload.sessionId !== activeSessionId.current) return;
      setSecondsLeft(0);
      setLocalStream(null);
      setTimeLimitOpen(true);
      setNotice('Time limit reached. This call has ended.');
    });
    socket.on('chat.message', (payload: { id: string; from: string; body: string }) => {
      setMessages((current) => [
        ...current,
        { id: payload.id, body: payload.body, from: payload.from, mine: false },
      ]);
    });
    socket.on('chat.ack', (payload: { clientMsgId: string }) => {
      setMessages((current) =>
        current.map((m) => (m.id === payload.clientMsgId ? { ...m, status: 'sent' } : m)),
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
        const last = [...current].reverse().find((m) => m.mine && m.status === 'sending');
        return last
          ? current.map((m) => (m.id === last.id ? { ...m, status: 'failed' } : m))
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

  function startFromRules() {
    sessionStorage.setItem('posha:connect-safety-seen', 'true');
    setPreChatOpen(false);
    startQueue(mode);
  }

  useEffect(() => {
    if (!socketRef.current || state === 'idle') return;
    const timer = window.setInterval(() => socketRef.current?.emit('heartbeat', {}), 5_000);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (mode !== 'video' || !videoConsentAccepted || !videoReady || !sessionId) return;
    const timer = window.setInterval(() => setSecondsLeft((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [mode, videoConsentAccepted, videoReady, sessionId]);

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
    setLocalStream(null);
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
        stream.getTracks().forEach((t) => t.stop());
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
    <section className={`connect-page connect-page--${mode}`} aria-labelledby="connect-title">
      <header className="connect-page__intro">
        <Link to="/home" className="connect-back" aria-label="Back to home">
          <ChevronLeft width={20} />
        </Link>
        <div>
          <p className="eyebrow">POSHA CONNECT · ADULTS ONLY</p>
          <h1 id="connect-title">
            {mode === 'video' ? 'Video chat with strangers' : 'Chat with strangers'}
          </h1>
        </div>
      </header>

      {state === 'idle' ? (
        <div className="connect-start-card">
          <span className="connect-start-card__icon" aria-hidden="true">
            {mode === 'video' ? <Video width={26} /> : <ChatFallback />}
          </span>
          <h2>{mode === 'video' ? 'Face to face' : 'Text, instantly'}</h2>
          <p>
            {mode === 'video'
              ? 'Meet someone new on a short video call.'
              : 'Start a private, non-explicit conversation with another adult.'}
          </p>
          <p className="fine-print">
            Report and block are always one tap away. Keep personal contact details private.
          </p>
          <Button
            icon={mode === 'video' ? <Video width={16} /> : undefined}
            onClick={() => (preChatOpen ? setPreChatOpen(true) : startQueue(mode))}
          >
            {mode === 'video' ? 'Start video chat' : 'Start chatting'}
          </Button>
          {videoEnabled ? (
            <Button
              variant="secondary"
              onClick={() => setMode(mode === 'video' ? 'text' : 'video')}
            >
              {mode === 'video' ? 'Switch to text chat' : 'Switch to video chat'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {state === 'connecting' ? (
        <div className="connect-status connect-searching" role="status" aria-live="polite">
          <span className="connect-radar" aria-hidden="true">
            {mode === 'video' ? <Video width={44} /> : <ChatFallback size={44} />}
          </span>
          <h2>
            {mode === 'video' ? 'Finding someone for a video chat…' : 'Finding someone for you…'}
          </h2>
          <Button variant="secondary" onClick={leaveQueue}>
            Cancel
          </Button>
        </div>
      ) : null}

      {state === 'queued' ? (
        <div className="connect-status connect-searching" role="status">
          <p>
            {position && position > 0
              ? `You’re in the queue (position ${position}).`
              : 'Finding a conversation…'}
          </p>
          <p className="fine-print">Your identity stays private. Keep it kind and non-explicit.</p>
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
            <span className="connect-avatar" aria-hidden="true">
              {partner.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h2>{partner}</h2>
              <p>
                <span className="connect-status-dot" aria-hidden="true" /> Connected
              </p>
            </div>
            <div className="connect-session__actions">
              <Button
                disabled={leavingSession.current}
                onClick={() => {
                  setLocalStream(null);
                  setSafetyAction('report');
                }}
                variant="secondary"
                icon={<Shield width={14} />}
              >
                Report
              </Button>
              <Button
                disabled={leavingSession.current}
                onClick={() => {
                  setLocalStream(null);
                  setSafetyAction('block');
                }}
                variant="danger"
                icon={<X width={14} />}
              >
                Block
              </Button>
            </div>
          </header>
          <p className="connect-system-pill">You’re matched. Keep it kind and non-explicit.</p>

          {mode === 'video' && !videoConsentAccepted && !videoConsentSubmitted ? (
            <div className="feature-card" aria-label="Video consent">
              <p>
                Video is optional. Your camera and microphone stay off until both people accept and
                you allow access. If enabled, small video frames are periodically sampled for
                automated safety checks and are not saved. You can decline or leave at any time.
                Keep the conversation non-explicit and report anything that makes you uncomfortable.
              </p>
              <Button
                disabled={leavingSession.current}
                onClick={() => submitVideoConsent(true)}
                icon={<Video width={16} />}
              >
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
            <div className="connect-video-call" role="region" aria-label="Video call">
              <div
                className="connect-video-call__remote"
                aria-label="Remote video privacy placeholder"
              >
                <span aria-hidden="true">{partner.slice(0, 1).toUpperCase()}</span>
                <p>Video is not connected in this build</p>
              </div>
              <div className="connect-video-call__timer" role="timer" aria-live="off">
                <strong>
                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} left
                </strong>
                <span>Guests get 2 min</span>
              </div>
              {secondsLeft === 15 ? (
                <span className="sr-only" role="status">
                  15 seconds left
                </span>
              ) : null}
              <p className="connect-video-call__upgrade">Subscribe to a creator to chat longer</p>
              <div className="connect-video-call__controls" aria-label="Call controls">
                <Button
                  variant="secondary"
                  onClick={() => setMuted((v) => !v)}
                  aria-pressed={muted}
                >
                  {muted ? 'Unmute' : 'Mute'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setCameraOff((v) => !v)}
                  aria-pressed={cameraOff}
                >
                  {cameraOff ? 'Camera on' : 'Camera'}
                </Button>
                <Button variant="secondary" onClick={nextSession}>
                  Next
                </Button>
                <Button variant="danger" onClick={() => setSafetyAction('report')}>
                  Report
                </Button>
                <Button variant="danger" onClick={leaveSession}>
                  Leave
                </Button>
              </div>
              <p>
                {videoReady
                  ? 'Both people agreed. Your camera and microphone remain off until you allow access.'
                  : 'Both people agreed. Preparing secure video room access…'}
              </p>
              {videoReady && !localStream ? (
                <Button
                  onClick={() => void enableCamera()}
                  disabled={leavingSession.current}
                  icon={<Camera width={16} />}
                >
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
                onChange={(e) => setDraft(e.currentTarget.value)}
                value={draft}
              />
              <Button
                type="submit"
                disabled={!draft.trim() || leavingSession.current}
                icon={<Send width={16} />}
              >
                Send
              </Button>
            </form>
          ) : null}

          <div className="connect-session__footer">
            {mode === 'text' ? (
              <Button disabled={leavingSession.current} onClick={nextSession} variant="secondary">
                Next stranger
              </Button>
            ) : null}
            <Button
              disabled={leavingSession.current}
              onClick={leaveSession}
              variant="danger"
              icon={<X width={14} />}
            >
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

      {preChatOpen && state === 'idle' ? (
        <div className="connect-sheet-backdrop">
          <section
            className="connect-rules-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connect-rules-title"
          >
            <span className="connect-sheet-handle" aria-hidden="true" />
            <p className="eyebrow">BE KIND</p>
            <h2 id="connect-rules-title">Be kind. Keep it non-explicit.</h2>
            <ul>
              <li>Respect boundaries and end the chat whenever you want.</li>
              <li>Never share private contact or financial details.</li>
              <li>Sexual content, harassment and threats are not allowed.</li>
            </ul>
            <p className="connect-rules-note">
              <Shield width={14} /> Report and block are always one tap away.
            </p>
            <fieldset className="interest-picker">
              <legend>Optional interests</legend>
              {['Music', 'Travel', 'Food', 'Books'].map((interest) => (
                <Chip
                  key={interest}
                  type="button"
                  selected={interests.includes(interest)}
                  onClick={() =>
                    setInterests((c) =>
                      c.includes(interest) ? c.filter((x) => x !== interest) : [...c, interest],
                    )
                  }
                >
                  {interest}
                </Chip>
              ))}
            </fieldset>
            <Button onClick={startFromRules}>
              {mode === 'video' ? 'Find a video chat' : 'Start chatting'}
            </Button>
            <button
              className="connect-rules-cancel"
              type="button"
              onClick={() => setPreChatOpen(false)}
            >
              Not now
            </button>
          </section>
        </div>
      ) : null}

      {timeLimitOpen ? (
        <div className="subscribe-backdrop">
          <section
            className="time-limit-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="time-limit-title"
          >
            <span className="connect-sheet-handle" aria-hidden="true" />
            <span className="time-limit-heart" aria-hidden="true">
              <Heart width={28} fill="currentColor" />
            </span>
            <h2 id="time-limit-title">Your 2 minutes are up</h2>
            <p>Subscribe to any creator to keep video chatting for longer.</p>
            <ul>
              <li>
                <Check width={14} /> Video chats up to 30 minutes
              </li>
              <li>
                <Check width={14} /> Unlock that creator’s videos
              </li>
              <li>
                <Check width={14} /> Cancel any time
              </li>
            </ul>
            <Button onClick={() => navigate('/profile')}>Subscribe from KSh 300</Button>
            <Button variant="secondary" onClick={() => navigate('/home')}>
              Back to home
            </Button>
          </section>
        </div>
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

/* Chat icon fallback (Chat is intentionally excluded from the top imports to avoid clash) */
function ChatFallback({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.2-3.3A7.5 7.5 0 1 1 20 11.5Z" />
    </svg>
  );
}
