import { createContext, useContext, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
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
import { Badge, Button, Checkbox, ErrorState, Input } from '@posha/ui';
import type { AgeStatus, PoshaApiClient } from './api/client.js';
import { HttpPoshaApiClient } from './api/client.js';
import { ConnectPage } from './connect/ConnectPage.js';

interface SessionContextValue {
  accessToken: string | null;
  setAccessToken: (value: string | null) => void;
  adultConfirmed: boolean;
  setAdultConfirmed: (value: boolean) => void;
  ageStatus: AgeStatus['status'] | null;
  setAgeStatus: (value: AgeStatus['status'] | null) => void;
  api: PoshaApiClient;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function clearOnboardingStorage() {
  sessionStorage.removeItem('posha:pending-identity');
  sessionStorage.removeItem('posha:alias');
  sessionStorage.removeItem('posha:creator-auth-intent');
}

function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionContext is missing');
  return value;
}

function PublicLayout() {
  return (
    <main className="posha-public">
      <Outlet />
    </main>
  );
}

function WelcomePage() {
  const { adultConfirmed, setAdultConfirmed } = useSession();
  if (adultConfirmed) return <Navigate to="/home" replace />;
  return (
    <section className="welcome-card" aria-labelledby="welcome-title">
      <div className="brand-mark" aria-hidden="true">
        P
      </div>
      <Badge variant="adult">Adults 18+</Badge>
      <h1 id="welcome-title">Find a friendly conversation.</h1>
      <p>POSHA is for adults. Confirm you are 18 or older to continue.</p>
      <Checkbox
        checked={adultConfirmed}
        label="I confirm that I am 18 or older"
        onChange={(event) => {
          const confirmed = event.currentTarget.checked;
          if (confirmed) localStorage.setItem('posha:adult-confirmed', 'true');
          else localStorage.removeItem('posha:adult-confirmed');
          setAdultConfirmed(confirmed);
        }}
      />
    </section>
  );
}

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
        ← Back
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
  const { api, setAccessToken, setAgeStatus } = useSession();
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
        ← Change email or phone
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
      if (provider.protocol !== 'https:') {
        throw new Error('The secure age-check link is unavailable. Try again later.');
      }
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
          onChange={(event) => setAlias(event.currentTarget.value)}
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
        onChange={(event) => setAccepted(event.currentTarget.checked)}
      />
      <Button disabled={!accepted} onClick={() => navigate('/home')}>
        Go to POSHA
      </Button>
    </section>
  );
}

function RequireVerifiedAdult() {
  const { accessToken, ageStatus, adultConfirmed } = useSession();
  const location = useLocation();
  if (!adultConfirmed)
    return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  if (!accessToken) {
    return location.pathname === '/home' ? (
      <GuestHomePage />
    ) : (
      <Navigate to="/home" replace state={{ from: location.pathname }} />
    );
  }
  if (ageStatus !== 'passed') return <Navigate to="/age" replace />;
  return <MemberLayout />;
}

function RequireAdultConfirmation() {
  const { adultConfirmed } = useSession();
  const location = useLocation();
  return adultConfirmed ? (
    <Outlet />
  ) : (
    <Navigate to="/welcome" replace state={{ from: location.pathname }} />
  );
}

function RequireCreatorAuthIntent() {
  return sessionStorage.getItem('posha:creator-auth-intent') === 'true' ? (
    <Outlet />
  ) : (
    <Navigate to="/home" replace />
  );
}

const tabs = [
  { to: '/home', label: 'Home', symbol: '⌂' },
  { to: '/discover', label: 'Discover', symbol: '⌕' },
  { to: '/live', label: 'Live', symbol: '●' },
  { to: '/chats', label: 'Chats', symbol: '▤' },
  { to: '/profile', label: 'Profile', symbol: '◎' },
] as const;

function MemberLayout() {
  const { setAccessToken, setAgeStatus } = useSession();
  return (
    <div className="safe-area-shell">
      <header className="top-bar">
        <Link className="wordmark" to="/home">
          POSHA
        </Link>
        <Link className="settings-link" to="/profile/privacy">
          Privacy & settings
        </Link>
      </header>
      <main id="main-content" className="member-main" tabIndex={-1}>
        <Outlet />
      </main>
      <nav className="bottom-tab-bar" aria-label="Main navigation">
        {tabs.map((tab) => (
          <NavLink
            className={({ isActive }) => `tab-link${isActive ? ' is-active' : ''}`}
            key={tab.to}
            to={tab.to}
          >
            <span className="tab-symbol" aria-hidden="true">
              {tab.symbol}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
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

function HomePage() {
  const navigate = useNavigate();
  return (
    <section className="page-content" aria-labelledby="home-title">
      <p className="eyebrow">A calmer way to connect</p>
      <h1 id="home-title">Welcome to POSHA</h1>
      <p>Your age check is complete. Choose how you’d like to explore.</p>
      <div className="feature-card">
        <div>
          <h2>Start chatting</h2>
          <p>Text chat with another verified adult.</p>
        </div>
        <Button onClick={() => navigate('/connect')}>Start text chat</Button>
        <p className="fine-print" id="chat-unavailable">
          Text chat is available to verified adults. Video chat stays locked.
        </p>
      </div>
      <Link className="secondary-link" to="/discover">
        Browse profiles
      </Link>
    </section>
  );
}

function GuestHomePage() {
  const navigate = useNavigate();
  function openCreatorAuth() {
    sessionStorage.setItem('posha:creator-auth-intent', 'true');
    navigate('/auth/identity');
  }
  return (
    <div className="guest-home-shell">
      <header className="guest-home-header">
        <Link className="wordmark" to="/home" aria-label="POSHA home">
          POSHA
        </Link>
        <Button variant="secondary" onClick={openCreatorAuth}>
          Creator sign in
        </Button>
      </header>
      <main className="guest-home-main">
        <section className="guest-home-hero" aria-labelledby="guest-home-title">
          <div className="guest-home-hero__copy">
            <p className="eyebrow">A calmer way to connect</p>
            <h1 id="guest-home-title">Welcome to POSHA</h1>
            <p>Meet new people for thoughtful conversations, at your own pace.</p>
            <Badge variant="adult">18+ confirmed</Badge>
          </div>
          <div className="guest-home-art" aria-hidden="true">
            <span className="guest-home-art__orbit guest-home-art__orbit--one" />
            <span className="guest-home-art__orbit guest-home-art__orbit--two" />
            <span className="guest-home-art__spark">✦</span>
          </div>
        </section>
        <section className="guest-home-grid" aria-label="Ways to connect">
          <article className="guest-feature-card guest-feature-card--chat">
            <span className="guest-feature-card__icon" aria-hidden="true">
              ◌
            </span>
            <p className="guest-feature-card__eyebrow">POSHA Connect</p>
            <h2>Text chats</h2>
            <p>Meet someone new in a one-to-one conversation.</p>
            <Button disabled aria-describedby="guest-chat-unavailable">
              Text chat unavailable
            </Button>
            <p className="guest-feature-card__status" id="guest-chat-unavailable">
              Chat access isn’t available for guests yet.
            </p>
          </article>
          <article className="guest-feature-card guest-feature-card--video">
            <span className="guest-feature-card__icon" aria-hidden="true">
              ◉
            </span>
            <p className="guest-feature-card__eyebrow">Coming soon</p>
            <h2>Video chats</h2>
            <p>Face-to-face conversations will appear here when available.</p>
            <Button disabled>Video chat unavailable</Button>
          </article>
        </section>
      </main>
      <footer className="guest-home-footer">
        Browsing as a guest <span aria-hidden="true">·</span> No member account needed
      </footer>
    </div>
  );
}

function ConnectRoute() {
  const { accessToken, api } = useSession();
  if (!accessToken) return <Navigate to="/welcome" replace />;
  return <ConnectPage accessToken={accessToken} api={api} />;
}

function SimpleTabPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="page-content">
      <h1>{title}</h1>
      <p>{description}</p>
      <ErrorState title="Nothing here yet">This section will appear when it’s ready.</ErrorState>
    </section>
  );
}

function ProfilePage() {
  return (
    <section className="page-content">
      <h1>Your profile</h1>
      <p>Your private settings and account tools.</p>
      <Link className="secondary-link" to="/profile/privacy">
        Privacy and account settings
      </Link>
    </section>
  );
}

function PrivacyNoticePage() {
  return (
    <section className="form-card" aria-labelledby="privacy-notice-title">
      <Link className="back-link" to="/age">
        ← Back to age check
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
      window.location.assign('/welcome');
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
          onChange={(event) => void saveLocale(event.currentTarget.value)}
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

export function WebRoutes({ api }: { api: PoshaApiClient }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [adultConfirmed, setAdultConfirmed] = useState(
    () => localStorage.getItem('posha:adult-confirmed') === 'true',
  );
  const [ageStatus, setAgeStatus] = useState<AgeStatus['status'] | null>(null);
  const session = {
    accessToken,
    setAccessToken,
    adultConfirmed,
    setAdultConfirmed,
    ageStatus,
    setAgeStatus,
    api,
  };
  return (
    <SessionContext.Provider value={session}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Navigate to="/welcome" replace />} />
          <Route path="welcome" element={<WelcomePage />} />
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
          <Route path="profile/privacy" element={<PrivacyPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </SessionContext.Provider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <WebRoutes api={new HttpPoshaApiClient()} />
    </BrowserRouter>
  );
}
