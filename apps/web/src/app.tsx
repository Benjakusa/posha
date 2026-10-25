import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ReactNode } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';
import {
  Badge,
  Button,
  Chat,
  Checkbox,
  Check,
  ChevronRight,
  ChevronLeft,
  Compass,
  ErrorState,
  Heart,
  Home as HomeIcon,
  Input,
  Lock,
  LogOut,
  MessageCircle,
  Moon,
  PageTransition,
  Play,
  Radio,
  Send,
  Settings,
  Shield,
  Sparkle,
  Sun,
  User,
  Video,
  Wallet,
  X,
} from '@posha/ui';
import { ApiRequestError } from './api/client.js';
import type { AgeStatus, CatalogHome, GuestSession, PoshaApiClient } from './api/client.js';
import { HttpPoshaApiClient } from './api/client.js';
import { ConnectPage } from './connect/ConnectPage.js';
import { ThemeProvider, useTheme } from './theme.js';

/* ─── Image sources (Unsplash) ─── */

const U = '?w=1200&auto=format&fit=crop&q=70';
const IMAGES = {
  hero: 'https://plus.unsplash.com/premium_photo-1661274026933-7649c3ac7a89' + U,
  liveHead: 'https://images.unsplash.com/photo-1544293180-6749b85ce918' + U,
  videosHead: 'https://images.unsplash.com/photo-1592599457454-e6ace3370314' + U,
  creatorBanner: 'https://plus.unsplash.com/premium_photo-1665160824807-8b5a6c6c877f' + U,
  chatBanner: 'https://plus.unsplash.com/premium_photo-1665160824586-d5c9224a2250' + U,
  video1: 'https://plus.unsplash.com/premium_photo-1661373110642-378fe6e1d7e8' + U,
  video2: 'https://plus.unsplash.com/premium_photo-1723701855715-a21fae5dafea' + U,
  video3: 'https://images.unsplash.com/photo-1544293180-6749b85ce918' + U,
} as const;

/* ─── Session ─── */

interface SessionContextValue {
  accessToken: string | null;
  setAccessToken: (value: string | null) => void;
  adultConfirmed: boolean;
  setAdultConfirmed: (value: boolean) => void;
  guestSession: GuestSession | null;
  setGuestSession: (value: GuestSession | null) => void;
  ageStatus: AgeStatus['status'] | null;
  setAgeStatus: (value: AgeStatus['status'] | null) => void;
  api: PoshaApiClient;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function clearOnboardingStorage() {
  sessionStorage.removeItem('posha:pending-identity');
  sessionStorage.removeItem('posha:alias');
  sessionStorage.removeItem('posha:creator-auth-intent');
  localStorage.removeItem('posha:guest-session');
}

function readStoredGuestSession(): GuestSession | null {
  try {
    const saved = localStorage.getItem('posha:guest-session');
    if (!saved) return null;
    const session = JSON.parse(saved) as GuestSession;
    if (!session.accessToken || Date.parse(session.expiresAt) <= Date.now()) {
      localStorage.removeItem('posha:guest-session');
      localStorage.removeItem('posha:adult-confirmed');
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem('posha:guest-session');
    return null;
  }
}

function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionContext is missing');
  return value;
}

/* ─── Shared components ─── */

const NAV = [
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/discover', label: 'Discover', Icon: Compass },
  { to: '/live', label: 'Live', Icon: Radio },
  { to: '/chats', label: 'Chats', Icon: MessageCircle },
  { to: '/profile', label: 'Profile', Icon: User },
] as const;

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {NAV.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `bottom-nav__item${isActive ? ' is-active' : ''}`}
        >
          <Icon width={20} height={20} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function SectionHead({
  title,
  image,
  to = '#',
  cta = 'See all',
}: {
  title: string;
  image: string;
  to?: string;
  cta?: string;
}) {
  return (
    <header className="catalog-section__head">
      <img src={image} alt="" loading="lazy" />
      <div className="catalog-section__heading">
        <h2>{title}</h2>
        <Link to={to}>
          {cta} <ChevronRight width={14} height={14} />
        </Link>
      </div>
    </header>
  );
}

/* ─── Public layout ─── */

function PublicLayout() {
  const location = useLocation();
  return (
    <main className="posha-public">
      <PageTransition key={location.pathname}>
        <Outlet />
      </PageTransition>
    </main>
  );
}

/* ─── Welcome / age gate ─── */

function WelcomePage() {
  const { adultConfirmed, guestSession, setAdultConfirmed, setGuestSession, api } = useSession();
  const navigate = useNavigate();
  const trackRef = useRef<HTMLButtonElement | null>(null);
  const [drag, setDrag] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dragStart = useRef<number | null>(null);
  const dragProgress = useRef(0);
  const pointerClick = useRef(false);
  if (guestSession && adultConfirmed) return <Navigate to="/home" replace />;

  async function enter() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const session = await api.createGuestSession();
      localStorage.setItem('posha:guest-session', JSON.stringify(session));
      localStorage.setItem('posha:adult-confirmed', 'true');
      setGuestSession(session);
      setAdultConfirmed(true);
      navigate('/home', { replace: true });
    } catch (cause) {
      setDrag(0);
      const message = cause instanceof Error ? cause.message : "Couldn't continue. Try again.";
      if (import.meta.env.DEV) {
        console.error('[POSHA] Guest session request failed', {
          status: cause instanceof ApiRequestError ? cause.status : undefined,
          message,
        });
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  function updateDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragStart.current === null || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const maxTravel = Math.max(1, rect.width - 56);
    const progress = Math.max(0, Math.min(1, (event.clientX - rect.left - 28) / maxTravel));
    dragProgress.current = progress;
    setDrag(progress);
  }

  async function endDrag() {
    if (dragStart.current === null) return;
    dragStart.current = null;
    pointerClick.current = true;
    if (dragProgress.current >= 0.85) await enter();
    else {
      dragProgress.current = 0;
      setDrag(0);
    }
  }

  return (
    <section className="age-gate" aria-labelledby="welcome-title">
      <div className="age-gate__brand">
        <span className="brand-mark" aria-hidden="true">
          <Heart width={22} fill="currentColor" />
        </span>
        <span>posha</span>
      </div>
      <div className="age-gate__intro">
        <h1 id="welcome-title">
          Adults only.
          <br />
          Meet someone new.
        </h1>
        <p>Chat, video call and discover creators.</p>
      </div>
      <div className="age-gate__bottom">
        <div className="age-gate__confirm">
          <h2>Confirm you are 18 or older</h2>
          <button
            ref={trackRef}
            className="age-slide"
            type="button"
            aria-label="I am 18 or older. Enter POSHA"
            aria-busy={busy}
            disabled={busy}
            onPointerDown={(event) => {
              dragStart.current = event.clientX;
              pointerClick.current = false;
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={updateDrag}
            onPointerUp={() => void endDrag()}
            onPointerCancel={() => {
              dragStart.current = null;
              dragProgress.current = 0;
              setDrag(0);
            }}
            onClick={() => {
              if (pointerClick.current) {
                pointerClick.current = false;
                return;
              }
              void enter();
            }}
          >
            <span className="age-slide__label">{busy ? 'Entering…' : 'Slide to enter'}</span>
            <span
              className="age-slide__knob"
              style={{ left: `calc(${drag * 100}% - ${drag * 56}px)` }}
              aria-hidden="true"
            >
              <ChevronRight width={22} />
            </span>
          </button>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <p className="age-gate__leave">
          Under 18? Please leave. <a href="https://example.com">Leave</a>
        </p>
        <nav className="age-gate__links" aria-label="Legal and safety">
          <Link to="/terms">Terms</Link>
          <Link to="/safety">Safety rules</Link>
        </nav>
      </div>
    </section>
  );
}

/* ─── Auth ─── */

function IdentityPage() {
  const { api } = useSession();
  const navigate = useNavigate();
  const [identity, setIdentity] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.requestOtp(identity.trim());
      sessionStorage.setItem('posha:pending-identity', identity.trim());
      navigate('/auth/otp');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not request a code. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-card form-card--centered" aria-labelledby="identity-title">
      <Link className="back-link" to="/welcome">
        <ChevronLeft width={16} /> Back
      </Link>
      <h1 id="identity-title">Sign in</h1>
      <p>We’ll send a one-time code to your email or phone. Your contact details stay private.</p>
      <form onSubmit={submit}>
        <Input
          autoComplete="email"
          label="Email or phone number"
          onChange={(event) => setIdentity(event.currentTarget.value)}
          required
          value={identity}
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button loading={busy} type="submit">
          Send one-time code
        </Button>
      </form>
    </section>
  );
}

function OtpPage() {
  const { api, setAccessToken, setAgeStatus, setGuestSession } = useSession();
  const navigate = useNavigate();
  const identity = sessionStorage.getItem('posha:pending-identity') ?? '';
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => () => sessionStorage.removeItem('posha:pending-identity'), []);
  if (!identity) return <Navigate to="/auth/identity" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await api.verifyOtp(identity, code.trim());
      localStorage.removeItem('posha:guest-session');
      setGuestSession(null);
      setAccessToken(session.accessToken);
      const age = await api.getAgeStatus(session.accessToken);
      setAgeStatus(age.status);
      navigate(age.status === 'passed' ? '/onboarding/alias' : '/age');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'That code could not be verified. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-card" aria-labelledby="otp-title">
      <Link className="back-link" to="/auth/identity">
        <ChevronLeft width={16} /> Change email or phone
      </Link>
      <h1 id="otp-title">Enter your one-time code</h1>
      <p>We sent a code to {identity}.</p>
      <form onSubmit={submit}>
        <Input
          autoComplete="one-time-code"
          inputMode="numeric"
          label="Six-digit code"
          maxLength={6}
          onChange={(event) => setCode(event.currentTarget.value)}
          pattern="[0-9]{6}"
          required
          value={code}
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button loading={busy} type="submit">
          Verify code
        </Button>
      </form>
    </section>
  );
}

/* ─── Age gate / onboarding ─── */

function AgeGatePage() {
  const { accessToken, ageStatus, api, setAgeStatus } = useSession();
  const [loading, setLoading] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(ageStatus !== null);
  const [error, setError] = useState('');
  const [providerUrl, setProviderUrl] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void api
      .getAgeStatus(accessToken)
      .then((status) => {
        if (active) {
          setAgeStatus(status.status);
          setStatusLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setError('We could not load your verification status. Try again.');
          setStatusLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [accessToken, api, setAgeStatus]);

  if (!accessToken) return <Navigate to="/auth/identity" replace />;
  const token = accessToken;

  async function startCheck() {
    setLoading(true);
    setError('');
    try {
      const result = await api.startAgeCheck(token);
      const provider = new URL(result.sessionUrl);
      if (provider.protocol !== 'https:')
        throw new Error('The secure age-check link is unavailable. Try again later.');
      setAgeStatus(result.status);
      setProviderUrl(provider.toString());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Age verification is unavailable. Try again later.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function refreshStatus() {
    setStatusLoaded(false);
    setError('');
    try {
      const status = await api.getAgeStatus(token);
      setAgeStatus(status.status);
      setStatusLoaded(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'We could not load your verification status. Try again.',
      );
      setStatusLoaded(true);
    }
  }

  if (ageStatus === 'passed') return <Navigate to="/onboarding/alias" replace />;
  const failed = ageStatus === 'failed';
  const pending = ageStatus === 'pending' || ageStatus === 'manual_review';

  return (
    <section className="form-card" aria-labelledby="age-title">
      <Badge variant="adult">18+ age check</Badge>
      <h1 id="age-title">Verify you’re an adult</h1>
      <p>
        POSHA is for adults. We use an age-assurance provider to confirm eligibility before member
        areas become available.
      </p>
      <p className="privacy-note">
        Your identity documents stay with the provider. POSHA stores the verification result and
        provider reference, not raw ID images.
      </p>
      {!statusLoaded ? <p role="status">Checking your verification status…</p> : null}
      {pending ? (
        <p role="status">Your check is being reviewed. Member areas stay locked until it passes.</p>
      ) : null}
      {pending ? (
        <Button loading={!statusLoaded} onClick={() => void refreshStatus()} variant="secondary">
          Refresh verification status
        </Button>
      ) : null}
      {providerUrl ? (
        <a className="secondary-link" href={providerUrl} rel="noopener noreferrer" target="_blank">
          Open secure age check
        </a>
      ) : null}
      {failed ? (
        <p role="alert">
          The check did not pass. If you think this is a mistake, contact support to request a
          review.
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {statusLoaded && !pending ? (
        <Button loading={loading} onClick={() => void startCheck()}>
          Continue to secure age check
        </Button>
      ) : null}
      <Link className="secondary-link" to="/privacy-notice">
        Read the privacy notice
      </Link>
    </section>
  );
}

function AliasPage() {
  const navigate = useNavigate();
  const [alias, setAlias] = useState('');
  return (
    <section className="form-card" aria-labelledby="alias-title">
      <h1 id="alias-title">Choose a chat identity</h1>
      <p>Use a pseudonym. Don’t include your full name, phone number, or other contact details.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          sessionStorage.setItem('posha:alias', alias.trim());
          navigate('/onboarding/safety');
        }}
      >
        <Input
          label="Chat name"
          maxLength={24}
          minLength={3}
          onChange={(e) => setAlias(e.currentTarget.value)}
          required
          value={alias}
        />
        <Button type="submit">Continue</Button>
      </form>
    </section>
  );
}

function SafetyPage() {
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);
  return (
    <section className="form-card" aria-labelledby="safety-title">
      <h1 id="safety-title">A few safety basics</h1>
      <ul className="safety-list">
        <li>Keep personal contact and payment details private.</li>
        <li>Leave and report conversations that make you uncomfortable.</li>
        <li>Respect other people’s boundaries and choices.</li>
      </ul>
      <Checkbox
        checked={accepted}
        label="I understand these safety rules"
        onChange={(e) => setAccepted(e.currentTarget.checked)}
      />
      <Button disabled={!accepted} onClick={() => navigate('/home')}>
        Go to POSHA
      </Button>
    </section>
  );
}

/* ─── Route guards ─── */

function GuestRouteTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <PageTransition key={location.pathname}>{children}</PageTransition>;
}

function RequireVerifiedAdult() {
  const { accessToken, ageStatus, adultConfirmed, guestSession } = useSession();
  const location = useLocation();
  if (!adultConfirmed) return <Navigate to="/" replace state={{ from: location.pathname }} />;

  if (guestSession) {
    const path = location.pathname;
    const render = () => {
      if (path === '/home' || path === '/') return <HomePage />;
      if (path === '/connect') return <ConnectRoute />;
      if (path === '/profile') return <ProfilePage />;
      if (path === '/profile/subscriptions') return <ProfileSubscriptionsPage />;
      if (path === '/settings')
        return (
          <SimpleTabPage
            title="Settings"
            description="Theme and account preferences will appear here."
          />
        );
      if (path === '/discover')
        return <SimpleTabPage title="Discover" description="Find creator profiles and updates." />;
      if (path === '/live')
        return <SimpleTabPage title="Live rooms" description="See live and upcoming rooms." />;
      if (path === '/chats')
        return <SimpleTabPage title="Chats" description="Your conversations will appear here." />;
      return <Navigate to="/home" replace />;
    };
    return <GuestRouteTransition>{render()}</GuestRouteTransition>;
  }

  if (!accessToken) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  if (ageStatus !== 'passed') return <Navigate to="/age" replace />;
  return <MemberLayout />;
}

function RequireAdultConfirmation() {
  const { adultConfirmed } = useSession();
  const location = useLocation();
  return adultConfirmed ? (
    <Outlet />
  ) : (
    <Navigate to="/" replace state={{ from: location.pathname }} />
  );
}

function RequireCreatorAuthIntent() {
  return sessionStorage.getItem('posha:creator-auth-intent') === 'true' ? (
    <Outlet />
  ) : (
    <Navigate to="/home" replace />
  );
}

/* ─── Member layout (hook-order fix: useLocation read once) ─── */

function MemberLayout() {
  const { setAccessToken, setAgeStatus } = useSession();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const pathname = location.pathname;

  if (pathname === '/home') return <HomePage />;
  if (pathname === '/connect' || pathname.startsWith('/profile')) {
    return (
      <PageTransition key={pathname}>
        <Outlet />
      </PageTransition>
    );
  }

  return (
    <div className="safe-area-shell">
      <header className="top-bar">
        <Link className="wordmark" to="/home">
          POSHA
        </Link>
        <div className="header-actions">
          <Link className="settings-link" to="/profile/privacy">
            Privacy &amp; settings
          </Link>
          <button
            className="theme-toggle"
            type="button"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun width={20} /> : <Moon width={20} />}
          </button>
        </div>
      </header>
      <main id="main-content" className="member-main" tabIndex={-1}>
        <PageTransition key={pathname}>
          <Outlet />
        </PageTransition>
      </main>
      <BottomNav />
      <button
        className="sign-out"
        type="button"
        onClick={() => {
          setAccessToken(null);
          setAgeStatus(null);
          clearOnboardingStorage();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

/* ─── Home ─── */

function HomePage() {
  return <GuestHomePage />;
}

function GuestHomePage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { api, guestSession, accessToken } = useSession();
  const token = accessToken ?? guestSession?.accessToken;
  const [catalog, setCatalog] = useState<CatalogHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getCatalogHome(token)
      .then((result) => {
        if (active) {
          setCatalog(result);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, token]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formatPrice = (minor: number) =>
    `KSh ${new Intl.NumberFormat('en-KE').format(minor / 100)}`;
  const countdown = (value: string) => {
    const seconds = Math.max(0, Math.floor((Date.parse(value) - now) / 1000));
    if (seconds === 0) return 'LIVE NOW';
    return `LIVE IN ${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const heroSrc = catalog?.heroUrl ?? IMAGES.hero;
  const videoFallbacks = [IMAGES.video1, IMAGES.video2, IMAGES.video3];

  return (
    <div className="guest-home-shell">
      <header className="guest-home-header">
        <Link className="wordmark" to="/home" aria-label="POSHA home">
          <span className="brand-mark" aria-hidden="true">
            <Heart width={17} fill="currentColor" />
          </span>{' '}
          posha
        </Link>
        <nav className="guest-home-header__actions" aria-label="Account and display">
          <Link className="home-icon-button" to="/settings" aria-label="Settings" title="Settings">
            <Settings width={19} />
          </Link>
          <Link className="home-icon-button" to="/profile" aria-label="Profile" title="Profile">
            <User width={19} />
          </Link>
          <button
            className="home-icon-button"
            type="button"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title="Change theme"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun width={19} /> : <Moon width={19} />}
          </button>
        </nav>
      </header>

      <main className="guest-home-main">
        {/* Hero: full-color image, solid black scrim behind copy */}
        <section
          className="guest-home-hero"
          aria-labelledby="guest-home-title"
          style={{ backgroundImage: `url("${heroSrc}")` }}
        >
          <div className="guest-home-hero__copy">
            <p className="eyebrow">ADULTS ONLY · 18+</p>
            <h1 id="guest-home-title">Meet someone new. Fall for the moment.</h1>
            <p>Random chat, face-to-face video and exclusive creators.</p>
            <div className="home-hero__actions">
              <Button icon={<Chat width={16} />} onClick={() => navigate('/connect?mode=text')}>
                Chat now
              </Button>
              <Button
                variant="secondary"
                icon={<Video width={16} />}
                onClick={() => navigate('/connect?mode=video')}
              >
                Video chat
              </Button>
            </div>
          </div>
        </section>

        {/* Two feature cards */}
        <section className="guest-home-grid" aria-label="Ways to connect">
          <article className="guest-feature-card guest-feature-card--text">
            <img
              className="guest-feature-card__banner"
              src="https://images.unsplash.com/photo-1613186187553-0efb12fa0c90?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D"
              alt=""
              loading="lazy"
            />
            <div className="guest-feature-card__content">
              <span className="guest-feature-card__icon" aria-hidden="true">
                <Chat width={21} />
              </span>
              <p className="guest-feature-card__eyebrow">Text, instantly</p>
              <h2>Chat with strangers</h2>
              <p>Meet someone new, one conversation at a time.</p>
              <Button icon={<Chat width={16} />} onClick={() => navigate('/connect?mode=text')}>
                Start text chat
              </Button>
            </div>
          </article>
          <article className="guest-feature-card guest-feature-card--video">
            <img
              className="guest-feature-card__banner"
              src="https://plus.unsplash.com/premium_photo-1701815884644-d01441d67b37?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D"
              alt=""
              loading="lazy"
            />
            <div className="guest-feature-card__content">
              <span className="guest-feature-card__icon" aria-hidden="true">
                <Video width={21} />
              </span>
              <p className="guest-feature-card__eyebrow">Face to face</p>
              <h2>Video chat</h2>
              <p>Meet in a quick, face-to-face conversation.</p>
              <Badge variant="adult">Guests: 2 min · Followers: longer</Badge>
              <Button
                variant="secondary"
                icon={<Video width={16} />}
                onClick={() => navigate('/connect?mode=video')}
              >
                Start video chat
              </Button>
            </div>
          </article>
        </section>

        {/* Live section — image section head */}
        <section className="catalog-section" aria-labelledby="live-title">
          <SectionHead title="Live soon" image={IMAGES.liveHead} to="/live" />
          {loading ? (
            <div className="live-carousel" aria-label="Loading live events">
              {[0, 1, 2].map((i) => (
                <div className="catalog-skeleton live-skeleton" key={i} />
              ))}
            </div>
          ) : null}
          {loadError ? (
            <ErrorState title="Couldn't load live events">
              <Button
                variant="secondary"
                onClick={() => {
                  setLoadError(false);
                  setLoading(true);
                  api
                    .getCatalogHome(token)
                    .then(setCatalog)
                    .catch(() => setLoadError(true))
                    .finally(() => setLoading(false));
                }}
              >
                Try again
              </Button>
            </ErrorState>
          ) : null}
          {!loading && !loadError && catalog?.lives.length === 0 ? (
            <p className="catalog-empty">No creators yet</p>
          ) : null}
          {!loading && !loadError && catalog?.lives.length ? (
            <div className="live-carousel">
              {catalog.lives.map((live, i) => {
                const isLive = Date.parse(live.startsAt) <= now;
                const cover =
                  live.coverUrl ??
                  [IMAGES.liveHead, IMAGES.chatBanner, IMAGES.creatorBanner][i % 3];
                return (
                  <article className="live-card" key={live.id}>
                    <div className="live-card__cover">
                      <img src={cover} alt="" loading="lazy" />
                    </div>
                    <span className="live-card__badge">
                      {isLive ? 'LIVE NOW' : countdown(live.startsAt)}
                    </span>
                    <h3>{live.title}</h3>
                    <p>{live.creator.displayName}</p>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setSubscribeOpen(true)}
                    >
                      Subscribe to join <ChevronRight width={14} height={14} />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        {/* Videos — image section head + full-color thumbnails */}
        <section className="catalog-section" aria-labelledby="videos-title">
          <SectionHead title="Latest videos" image={IMAGES.videosHead} to="/discover" />
          {loading ? (
            <div className="video-grid" aria-label="Loading videos">
              {[0, 1, 2, 3].map((i) => (
                <div className="catalog-skeleton video-skeleton" key={i} />
              ))}
            </div>
          ) : null}
          {loadError ? (
            <p role="alert" className="catalog-error">
              Creator videos couldn't load. Please try again.
            </p>
          ) : null}
          {!loading && !loadError && catalog?.videos.length === 0 ? (
            <p className="catalog-empty">No creators yet</p>
          ) : null}
          {!loading && !loadError && catalog?.videos.length ? (
            <div className="video-grid">
              {catalog.videos.map((video, i) => {
                const thumb =
                  video.thumbnailUrl ??
                  video.placeholderUrl ??
                  videoFallbacks[i % videoFallbacks.length];
                return (
                  <article
                    className={`catalog-video${video.locked ? ' is-locked' : ''}`}
                    key={video.id}
                  >
                    <img className="catalog-video__thumb" src={thumb} alt="" loading="lazy" />
                    {video.locked ? (
                      <span className="catalog-video__lock" aria-hidden="true">
                        <Lock width={22} />
                      </span>
                    ) : null}
                    <div className="catalog-video__details">
                      <p>
                        {video.creator.displayName} · {video.title}
                      </p>
                      {video.locked ? (
                        <button
                          type="button"
                          className="price-pill"
                          onClick={() => setSubscribeOpen(true)}
                        >
                          <Lock width={12} /> Subscribe {formatPrice(video.priceMinor)}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="price-pill"
                          onClick={() => navigate(`/videos/${video.id}`)}
                        >
                          <Play width={12} /> Play video
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </main>

      <BottomNav />
      {subscribeOpen ? <SubscribeSheet onClose={() => setSubscribeOpen(false)} /> : null}
      {guestSession ? <span className="sr-only">Browsing as {guestSession.alias}</span> : null}
    </div>
  );
}

/* ─── Connect route ─── */

function ConnectRoute() {
  const { accessToken, guestSession, api } = useSession();
  const location = useLocation();
  const token = accessToken ?? guestSession?.accessToken;
  if (!token) return <Navigate to="/" replace />;
  const requestedMode = new URLSearchParams(location.search).get('mode');
  return (
    <ConnectPage
      accessToken={token}
      api={api}
      initialMode={requestedMode === 'video' ? 'video' : 'text'}
      videoEnabled={requestedMode === 'video'}
    />
  );
}

/* ─── Simple tab placeholder ─── */

function SimpleTabPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="page-content">
      <h1>{title}</h1>
      <p>{description}</p>
      <ErrorState title="Nothing here yet">This section will appear when it’s ready.</ErrorState>
    </section>
  );
}

/* ─── Profile ─── */

function ProfilePage() {
  const { guestSession, accessToken, ageStatus } = useSession();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [studioPreview, setStudioPreview] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const isGuest = Boolean(guestSession || !accessToken);

  const beginSignIn = () => {
    sessionStorage.setItem('posha:creator-auth-intent', 'true');
    navigate('/auth/identity');
  };
  const beginCreatorFlow = () => {
    if (isGuest) beginSignIn();
    else setWizardOpen(true);
  };

  if (studioPreview) {
    return (
      <main className="creator-profile" data-theme={theme}>
        <header className="creator-profile__header">
          <h1>Creator studio</h1>
          <span className="eyebrow">PREVIEW</span>
        </header>
        <section className="creator-studio-preview" aria-labelledby="studio-title">
          <p className="eyebrow">PREVIEW · NOT AN APPROVED CREATOR ACCOUNT</p>
          <h2 id="studio-title">Your studio</h2>
          <div className="creator-studio-stats">
            <p>
              Subscribers <strong>—</strong>
            </p>
            <p>
              Earnings <strong>—</strong>
            </p>
            <p>
              Pending reviews <strong>—</strong>
            </p>
          </div>
          <Button disabled>Upload video</Button>
          <Button disabled variant="secondary">
            Schedule live
          </Button>
          <Button variant="secondary" onClick={() => setStudioPreview(false)}>
            Back to profile
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="creator-profile" data-theme={theme}>
      <header className="creator-profile__header">
        <h1>Profile</h1>
        <Link className="home-icon-button" to="/settings" aria-label="Settings">
          <Settings width={20} />
        </Link>
      </header>

      {/* Creator banner — image with black scrim */}
      <section className="creator-banner" aria-labelledby="creator-banner-title">
        <img className="creator-banner__img" src={IMAGES.creatorBanner} alt="" />
        <h2 id="creator-banner-title">Share your world. Earn from your fans.</h2>
        <p>Upload videos, go live and get paid by subscribers.</p>
        <Button variant="secondary" icon={<Sparkle width={16} />} onClick={beginCreatorFlow}>
          Become a creator
        </Button>
      </section>

      {submitted ? (
        <section className="creator-pending" role="status">
          <h2>Application submitted</h2>
          <p>Your creator profile is pending review. We’ll let you know when it’s ready.</p>
        </section>
      ) : null}
      {!isGuest && !submitted ? (
        <div className="creator-profile__actions">
          <Button icon={<Sparkle width={16} />} onClick={() => setWizardOpen(true)}>
            Continue creator application
          </Button>
        </div>
      ) : null}

      <section className="creator-account-list" aria-label="Account">
        <p>
          <span>{guestSession ? 'Guest alias' : 'Chat identity'}</span>
          <strong>{guestSession?.alias ?? 'Your account'}</strong>
        </p>
        <button type="button" onClick={() => navigate('/profile/subscriptions')}>
          <span>My subscriptions</span>
          <strong>
            None yet. Subscribe to chat longer <ChevronRight width={17} />
          </strong>
        </button>
        <button type="button" onClick={() => navigate('/settings')}>
          <span>Language and notifications</span>
          <strong>
            English <ChevronRight width={17} />
          </strong>
        </button>
        <button type="button" onClick={() => navigate('/profile/privacy')}>
          <span>Safety and privacy</span>
          <strong>
            Reports, blocked users <ChevronRight width={17} />
          </strong>
        </button>
      </section>

      {isGuest ? (
        <Button icon={<User width={16} />} onClick={beginSignIn}>
          Create account or sign in
        </Button>
      ) : null}
      {!isGuest && import.meta.env.DEV ? (
        <Button variant="secondary" onClick={() => setStudioPreview(true)}>
          Preview creator studio
        </Button>
      ) : null}

      <BottomNav />

      {wizardOpen ? (
        <div className="subscribe-backdrop">
          <section
            className="creator-wizard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="creator-wizard-title"
          >
            <button
              className="dialog-close"
              aria-label="Close creator application"
              onClick={() => setWizardOpen(false)}
            >
              <X width={18} />
            </button>
            <p className="eyebrow">CREATOR APPLICATION · STEP {step + 1} OF 4</p>
            <div className="creator-progress" aria-label={`Step ${step + 1} of 4`}>
              <span style={{ width: `${(step + 1) * 25}%` }} />
            </div>
            <h2 id="creator-wizard-title">
              {
                ['Your creator account', 'Adult verification', 'Your profile', 'Community rules'][
                  step
                ]
              }
            </h2>
            {step === 0 ? (
              <p>Use your POSHA member account for creator payouts and account security.</p>
            ) : null}
            {step === 1 ? (
              <div>
                <p>Creators must complete the age check before they can publish or earn.</p>
                <p className="creator-verification" role="status">
                  Age check status: {ageStatus ?? 'not started'}
                </p>
                {ageStatus !== 'passed' ? (
                  <Button variant="secondary" onClick={() => navigate('/age')}>
                    Continue age check
                  </Button>
                ) : null}
              </div>
            ) : null}
            {step === 2 ? (
              <div className="creator-wizard-fields">
                <Input
                  label="Display name"
                  required
                  maxLength={40}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.currentTarget.value)}
                />
                <Input
                  label="Handle"
                  required
                  maxLength={24}
                  value={handle}
                  onChange={(e) => setHandle(e.currentTarget.value)}
                />
                <label className="posha-field">
                  <span>Bio</span>
                  <textarea
                    maxLength={300}
                    value={bio}
                    onChange={(e) => setBio(e.currentTarget.value)}
                  />
                </label>
                <p>Subscription price starts at KSh 300.</p>
              </div>
            ) : null}
            {step === 3 ? (
              <p>
                Keep your page and videos within POSHA’s adults-only, non-explicit rules.
                Applications are reviewed before your creator page goes live.
              </p>
            ) : null}
            <div className="creator-wizard__actions">
              {step > 0 ? (
                <Button variant="secondary" onClick={() => setStep((c) => c - 1)}>
                  Back
                </Button>
              ) : null}
              {step < 3 ? (
                <Button
                  disabled={
                    (step === 2 && (!displayName.trim() || !handle.trim())) ||
                    (step === 1 && ageStatus !== 'passed')
                  }
                  onClick={() => setStep((c) => c + 1)}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setSubmitted(true);
                    setWizardOpen(false);
                  }}
                >
                  Accept rules and submit
                </Button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function ProfileSubscriptionsPage() {
  const navigate = useNavigate();
  return (
    <section className="page-content">
      <Link className="back-link" to="/profile">
        <ChevronLeft width={16} /> Profile
      </Link>
      <h1>My subscriptions</h1>
      <p>You don’t have any creator subscriptions yet.</p>
      <Button icon={<Compass width={16} />} onClick={() => navigate('/home')}>
        Discover creators
      </Button>
    </section>
  );
}

/* ─── Subscribe sheet ─── */

function SubscribeSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { guestSession, accessToken } = useSession();
  const [status, setStatus] = useState<'ready' | 'pending' | 'failed' | 'success'>('ready');
  const guest = Boolean(guestSession || !accessToken);

  return (
    <div className="subscribe-backdrop">
      <section
        className="subscribe-stub"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscribe-title"
      >
        <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>
          <X width={18} />
        </button>
        <span className="connect-sheet-handle" aria-hidden="true" />
        <p className="eyebrow">CREATOR SUBSCRIPTION</p>
        <h2 id="subscribe-title">Subscribe from KSh 300</h2>
        {status === 'ready' ? (
          <>
            <p>Unlock a creator’s videos and get longer video chats. Pay securely with M-Pesa.</p>
            {guest ? (
              <Button
                icon={<User width={16} />}
                onClick={() => {
                  sessionStorage.setItem('posha:creator-auth-intent', 'true');
                  navigate('/auth/identity');
                }}
              >
                Create account to continue
              </Button>
            ) : (
              <Button icon={<Wallet width={16} />} onClick={() => setStatus('pending')}>
                Continue with M-Pesa
              </Button>
            )}
            {import.meta.env.DEV ? (
              <Button variant="secondary" onClick={() => setStatus('pending')}>
                Simulate payment
              </Button>
            ) : null}
          </>
        ) : null}
        {status === 'pending' ? (
          <div role="status">
            <h3>Payment pending</h3>
            <p>Check your phone for the M-Pesa prompt.</p>
            {import.meta.env.DEV ? (
              <Button variant="secondary" onClick={() => setStatus('success')}>
                Simulate verified callback
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setStatus('failed')}>
              Payment failed
            </Button>
          </div>
        ) : null}
        {status === 'success' ? (
          <div role="status">
            <h3>
              <Check width={16} /> Demo payment complete
            </h3>
            <p>No subscription is active until the server verifies a real payment.</p>
          </div>
        ) : null}
        {status === 'failed' ? (
          <div role="alert">
            <p>Payment could not be confirmed. Try again.</p>
            <Button onClick={() => setStatus('ready')}>Retry</Button>
          </div>
        ) : null}
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </section>
    </div>
  );
}

/* ─── Privacy ─── */

function PrivacyNoticePage() {
  return (
    <section className="form-card" aria-labelledby="privacy-notice-title">
      <Link className="back-link" to="/age">
        <ChevronLeft width={16} /> Back to age check
      </Link>
      <h1 id="privacy-notice-title">Your privacy matters</h1>
      <p>
        POSHA uses a verification provider to confirm that members are adults. The provider handles
        identity documents; POSHA stores only a verification result and provider reference.
      </p>
      <p>
        You can request a copy of your data or start account deletion from Privacy and account
        settings after verification.
      </p>
      <Link className="secondary-link" to="/auth/identity">
        Account access help
      </Link>
    </section>
  );
}

function PolicyPage({ title }: { title: string }) {
  return (
    <section className="form-card" aria-labelledby="policy-title">
      <Link className="back-link" to="/">
        <ChevronLeft width={16} /> Back
      </Link>
      <h1 id="policy-title">{title}</h1>
      <p>
        POSHA is for adults aged 18 and over. Keep conversations kind, private, and non-explicit.
      </p>
    </section>
  );
}

function PrivacyPage() {
  const { accessToken, api, setAccessToken, setAgeStatus } = useSession();
  const [locale, setLocale] = useState('en');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveLocale(value: string) {
    setLocale(value);
    setNotice('');
    setError('');
    try {
      await api.updatePreferences(accessToken!, { locale: value });
      setNotice('Language preference saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that setting.');
    }
  }

  async function exportData() {
    setBusy(true);
    setError('');
    try {
      await api.requestDataExport(accessToken!);
      setNotice('Your data export request was received.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not request an export.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        'Request account deletion? Financial records may be retained where required by law.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api.requestDeletion(accessToken!);
      setAccessToken(null);
      setAgeStatus(null);
      clearOnboardingStorage();
      window.location.assign('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not request account deletion.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-content" aria-labelledby="privacy-title">
      <h1 id="privacy-title">Privacy and account</h1>
      <p>Review what’s saved and make changes to your account.</p>
      <label className="settings-row">
        <span>Language</span>
        <select
          aria-label="Language"
          onChange={(e) => void saveLocale(e.currentTarget.value)}
          value={locale}
        >
          <option value="en">English</option>
          <option value="sw">Kiswahili</option>
        </select>
      </label>
      <p className="fine-print">
        Online status controls will be available here when presence features launch.
      </p>
      <div className="settings-actions">
        <Button onClick={() => void exportData()} loading={busy} variant="secondary">
          Request data export
        </Button>
        <Button onClick={() => void deleteAccount()} variant="danger">
          Request account deletion
        </Button>
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/* ─── Routes ─── */

export function WebRoutes({ api }: { api: PoshaApiClient }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [guestSession, setGuestSession] = useState<GuestSession | null>(readStoredGuestSession);
  const [adultConfirmed, setAdultConfirmed] = useState(
    () =>
      Boolean(readStoredGuestSession()) || localStorage.getItem('posha:adult-confirmed') === 'true',
  );
  const [ageStatus, setAgeStatus] = useState<AgeStatus['status'] | null>(null);

  const session = {
    accessToken,
    setAccessToken,
    adultConfirmed,
    setAdultConfirmed,
    guestSession,
    setGuestSession,
    ageStatus,
    setAgeStatus,
    api,
  };

  return (
    <ThemeProvider>
      <SessionContext.Provider value={session}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<WelcomePage />} />
            <Route path="welcome" element={<Navigate to="/" replace />} />
            <Route path="terms" element={<PolicyPage title="Terms" />} />
            <Route path="safety" element={<PolicyPage title="Safety rules" />} />
            <Route path="privacy-notice" element={<PrivacyNoticePage />} />
            <Route element={<RequireAdultConfirmation />}>
              <Route element={<RequireCreatorAuthIntent />}>
                <Route path="auth/identity" element={<IdentityPage />} />
                <Route path="auth/otp" element={<OtpPage />} />
              </Route>
              <Route path="age" element={<AgeGatePage />} />
              <Route path="onboarding/alias" element={<AliasPage />} />
              <Route path="onboarding/safety" element={<SafetyPage />} />
            </Route>
          </Route>
          <Route path="/" element={<RequireVerifiedAdult />}>
            <Route path="home" element={<HomePage />} />
            <Route path="connect" element={<ConnectRoute />} />
            <Route
              path="discover"
              element={
                <SimpleTabPage title="Discover" description="Find creator profiles and updates." />
              }
            />
            <Route
              path="live"
              element={
                <SimpleTabPage title="Live rooms" description="See live and upcoming rooms." />
              }
            />
            <Route
              path="chats"
              element={
                <SimpleTabPage title="Chats" description="Your conversations will appear here." />
              }
            />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="profile/subscriptions" element={<ProfileSubscriptionsPage />} />
            <Route
              path="settings"
              element={
                <SimpleTabPage
                  title="Settings"
                  description="Theme and account preferences will appear here."
                />
              }
            />
            <Route path="profile/privacy" element={<PrivacyPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionContext.Provider>
    </ThemeProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <WebRoutes api={new HttpPoshaApiClient()} />
    </BrowserRouter>
  );
}
