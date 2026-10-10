// components/booker/BookerShell.tsx
// Layout for the Booking Agent workspace (/booker/*). Deliberately separate from
// the band AppShell: its own navigation, no band data, no inbox sync, no band
// subscription gate. It shares only the sign-in session and the visual system.
//
// Gate order: signed in → agent profile exists (otherwise show setup) → page.

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import BrandLogo from '../BrandLogo';
import { createBookerProfile, getMyBookerProfile } from '../../lib/booker/data';
import { BookerProfileSchema, fieldErrors } from '../../lib/booker/schemas';
import type { BookerProfile } from '../../lib/booker/types';
import { ErrorBanner, Field } from './ui';

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
  { label: 'Contacts', href: '/booker/contacts', icon: '☏' },
  { label: 'Commission', href: '/booker/commission', icon: '$' },
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

// ── First-run setup ─────────────────────────────────────────────────────────
function SetupWorkspace({ userId, defaultName, defaultEmail, onCreated }: { userId: string; defaultName: string; defaultEmail: string; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState({ agency_name: '', contact_name: defaultName, contact_email: defaultEmail, contact_phone: '', default_commission_pct: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const parsed = BookerProfileSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await createBookerProfile(userId, parsed.data);
      await onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not set up your workspace.');
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap" style={{ alignItems: 'flex-start', paddingTop: '3rem' }}>
      <Head>
        <title>Set up your Booking Agent workspace · Camel Ranch Booking</title>
      </Head>
      <main className="auth-card" style={{ maxWidth: 520, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <BrandLogo variant="square" height={72} />
        </div>
        <h1 className="display" style={{ fontSize: '2rem', textAlign: 'center', margin: '0 0 0.25rem', color: 'var(--text)' }}>
          Booking Agent workspace
        </h1>
        <p className="text-sm text-muted" style={{ textAlign: 'center', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          One place for every band you carry: their shows, your venues and contacts, and the commission you are owed. Your contacts and notes stay private to you.
        </p>
        {formError && <ErrorBanner message={formError} />}
        <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <Field label="Agency name" required error={errors.agency_name}>
            {p => <input {...p} className="input" value={form.agency_name} onChange={set('agency_name')} autoComplete="organization" />}
          </Field>
          <Field label="Your name" error={errors.contact_name}>
            {p => <input {...p} className="input" value={form.contact_name} onChange={set('contact_name')} autoComplete="name" />}
          </Field>
          <div className="grid-2">
            <Field label="Email" error={errors.contact_email}>
              {p => <input {...p} className="input" type="email" value={form.contact_email} onChange={set('contact_email')} autoComplete="email" />}
            </Field>
            <Field label="Phone" error={errors.contact_phone}>
              {p => <input {...p} className="input" type="tel" value={form.contact_phone} onChange={set('contact_phone')} autoComplete="tel" />}
            </Field>
          </div>
          <Field label="Default commission %" hint="Used for new bands. You can set a different rate per band." error={errors.default_commission_pct}>
            {p => <input {...p} className="input" inputMode="decimal" value={form.default_commission_pct} onChange={set('default_commission_pct')} placeholder="e.g. 10" />}
          </Field>
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy} aria-busy={busy}>
            {busy ? 'Setting up…' : 'Open my workspace'}
          </button>
        </form>
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
  const [state, setState] = useState<'loading' | 'ready' | 'setup' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  const loadBooker = useCallback(async () => {
    if (!user) return;
    try {
      const b = await getMyBookerProfile(user.id);
      setBooker(b);
      setState(b ? 'ready' : 'setup');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your workspace.');
      setState('error');
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
      return;
    }
    void loadBooker();
  }, [authLoading, user, loadBooker]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
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

  if (state === 'setup' || !booker) {
    return <SetupWorkspace userId={user.id} defaultName={profile?.display_name ?? ''} defaultEmail={user.email ?? ''} onCreated={loadBooker} />;
  }

  const hasBandWorkspace = Boolean(profile?.act_id) || profile?.role === 'superadmin';

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
            {hasBandWorkspace && (
              <Link href={profile?.role === 'superadmin' ? '/admin' : '/band'} className="sidebar-link">
                <span aria-hidden="true" style={{ width: 18, textAlign: 'center' }}>
                  ⇄
                </span>
                {profile?.role === 'superadmin' ? 'Platform admin' : 'Band workspace'}
              </Link>
            )}
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
