// components/booker/BookerShell.tsx
// Layout for the Booking Agent workspace (/booker/*). Deliberately separate from
// the band AppShell: its own navigation, no band data, no inbox sync, no band
// subscription gate. It shares only the sign-in session and the visual system.
//
// Gate order: signed in (otherwise the agent sign-in) → agent profile exists
// (otherwise this is a band-side login: point it home, never offer setup) → page.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import BrandLogo from '../BrandLogo';
import { getMyBookerProfile } from '../../lib/booker/data';
import { bandSideHome } from '../../lib/accountSide';
import type { BookerProfile } from '../../lib/booker/types';
import { ErrorBanner } from './ui';

interface BookerContextValue {
  booker: BookerProfile;
  /** Re-reads the agent profile (after Settings saves). */
  refreshBooker: () => Promise<void>;
}

const BookerContext = createContext<BookerContextValue | null>(null);

/** The signed-in agent's profile. Only usable inside BookerShell. */
export function useBooker(): BookerContextValue {
  const ctx = useContext(BookerContext);
  if (!ctx) throw new Error('useBooker must be used inside <BookerShell>');
  return ctx;
}

export const BOOKER_NAV = [
  { label: 'Home', href: '/booker', icon: '◈' },
  { label: 'Bands', href: '/booker/bands', icon: '♪' },
  { label: 'Shows', href: '/booker/shows', icon: '◷' },
  { label: 'Venues', href: '/booker/venues', icon: '⌂' },
  { label: 'Commission', href: '/booker/commission', icon: '$' },
  { label: 'Assistant', href: '/booker/assistant', icon: '✦' },
  { label: 'Settings', href: '/booker/settings', icon: '⚙' },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === '/booker' ? pathname === '/booker' : pathname === href || pathname.startsWith(`${href}/`);
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.85rem', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        {children}
      </div>
    </div>
  );
}

// ── Band-side login that reached the agent workspace ───────────────────────
// Each login belongs to one side (lib/accountSide.ts). A band admin, member or
// the superadmin who lands on /booker is never offered an agent workspace; they
// are pointed back to their own side. Agent workspaces are created only by the
// agent sign-up (/booker/signup → /api/booker/register).
function NotAnAgentAccount({ home, onSignOut }: { home: string; onSignOut: () => Promise<void> }) {
  return (
    <div className="auth-wrap">
      <Head>
        <title>Booking Agent workspace · Camel Ranch Booking</title>
      </Head>
      <main className="auth-card" style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <BrandLogo variant="square" height={64} />
        </div>
        <h1 className="display" style={{ fontSize: '1.9rem', margin: '0 0 0.5rem', color: 'var(--text)' }}>
          This is a band account
        </h1>
        <p className="text-sm text-muted" style={{ lineHeight: 1.6, marginBottom: '1.25rem' }}>
          The Booking Agent workspace is for agent accounts only. Band accounts and agent accounts are kept separate, so this login stays on the band side.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <a className="btn btn-primary" href={home}>
            Go to my band workspace
          </a>
          <button type="button" className="btn btn-ghost" onClick={() => void onSignOut()}>
            Sign out and use an agent account
          </button>
        </div>
      </main>
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────────
interface Props {
  children: ReactNode;
  /** Browser tab title for this page */
  title: string;
}

export default function BookerShell({ children, title }: Props) {
  const router = useRouter();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [booker, setBooker] = useState<BookerProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not-agent' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  const loadBooker = useCallback(async () => {
    if (!user) return;
    try {
      const b = await getMyBookerProfile(user.id);
      setBooker(b);
      setState(b ? 'ready' : 'not-agent');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your workspace.');
      setState('error');
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/booker/login?next=${encodeURIComponent(router.asPath)}`);
      return;
    }
    void loadBooker();
  }, [authLoading, user, loadBooker]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = async () => {
    await signOut();
    router.replace('/booker/login');
  };

  if (authLoading || !user || state === 'loading') return <CenteredMessage>Loading…</CenteredMessage>;

  if (state === 'error') {
    return (
      <div style={{ maxWidth: 560, margin: '4rem auto', padding: '0 1rem' }}>
        <ErrorBanner
          message={loadError}
          onRetry={() => {
            setState('loading');
            void loadBooker();
          }}
        />
      </div>
    );
  }

  if (state === 'not-agent' || !booker) {
    return <NotAnAgentAccount home={bandSideHome(profile?.role ?? null)} onSignOut={handleSignOut} />;
  }

  return (
    <BookerContext.Provider value={{ booker, refreshBooker: loadBooker }}>
      <Head>
        <title>{`${title} · Booking Agent · Camel Ranch Booking`}</title>
      </Head>
      <a href="#booker-main" className="skip-link" style={{ position: 'absolute', left: -9999, top: 0 }} onFocus={e => (e.currentTarget.style.left = '1rem')} onBlur={e => (e.currentTarget.style.left = '-9999px')}>
        Skip to content
      </a>
      <div className="app-shell">
        <button className="mobile-menu-btn" onClick={() => setNavOpen(v => !v)} aria-label={navOpen ? 'Close menu' : 'Open menu'} aria-expanded={navOpen} aria-controls="booker-nav">
          <span />
          <span />
          <span />
        </button>
        {navOpen && <div className="mobile-overlay" onClick={() => setNavOpen(false)} />}

        <aside id="booker-nav" className={`sidebar${navOpen ? ' open' : ''}`} aria-label="Booking Agent navigation">
          <div className="sidebar-logo">
            <BrandLogo variant="square" height={64} />
          </div>
          <div style={{ padding: '0.9rem 1rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
            <div className="eyebrow" style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>
              Booking Agent
            </div>
            <div style={{ color: 'var(--text)', fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{booker.agency_name}</div>
          </div>
          <nav className="sidebar-section" aria-label="Workspace">
            {BOOKER_NAV.map(item => {
              const active = isActive(router.pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link${active ? ' active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setNavOpen(false)}
                >
                  <span aria-hidden="true" style={{ width: 18, textAlign: 'center' }}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="sidebar-section" style={{ marginTop: 'auto' }}>
            <button type="button" className="sidebar-link" onClick={handleSignOut}>
              <span aria-hidden="true" style={{ width: 18, textAlign: 'center' }}>
                ⏻
              </span>
              Sign out
            </button>
          </div>
        </aside>

        <main id="booker-main" className="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </BookerContext.Provider>
  );
}
