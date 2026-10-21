// pages/booker/login.tsx
// Sign-in for Booking Agent accounts only. Band admins, members and the
// superadmin sign in at /login. Each login belongs to one side of the platform
// (lib/accountSide.ts), so a band login used here is never offered an agent
// workspace: it is told this page is for agents and pointed to its own side.

import { useState, type FormEvent } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import BrandLogo from '../../components/BrandLogo';
import { ErrorBanner, Field } from '../../components/booker/ui';
import { bandSideHome, fetchHasAgentWorkspace, safeAgentNext } from '../../lib/accountSide';

const SIGN_IN_TIMEOUT_MS = 8000;

type View = 'sign-in' | 'forgot' | 'forgot-sent';

/** A band-side login used on the agent page: where its own home is. */
interface WrongSide {
  home: string;
}

export default function BookerLogin() {
  const router = useRouter();
  const [view, setView] = useState<View>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrongSide, setWrongSide] = useState<WrongSide | null>(null);

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setWrongSide(null);
    setBusy(true);

    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Sign-in timed out. Please try again.')), SIGN_IN_TIMEOUT_MS));
      const { error: authErr } = await Promise.race([supabase.auth.signInWithPassword({ email: email.trim(), password }), timeout]);
      if (authErr) {
        setError(authErr.message);
        return;
      }

      // getSession reads the stored session; no extra network round-trip.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        setError('Sign-in failed. Please try again.');
        return;
      }

      const isAgent = await fetchHasAgentWorkspace(userId);
      if (isAgent === null) {
        setError("We couldn't check your account just now. Please try again.");
        return;
      }
      if (isAgent) {
        window.location.href = safeAgentNext(router.query.next);
        return;
      }

      // A band-side login. Never offer it an agent workspace.
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
      setWrongSide({ home: bandSideHome(profile?.role ?? null) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (resetErr) {
      setError(resetErr.message);
      return;
    }
    setView('forgot-sent');
  };

  return (
    <div className="auth-wrap" style={{ alignItems: 'flex-start', paddingTop: '2.5rem' }}>
      <Head>
        <title>Booking Agent sign in · Camel Ranch Booking</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="auth-card" style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <BrandLogo variant="square" height={72} />
        </div>
        <h1 className="display" style={{ fontSize: '2.1rem', textAlign: 'center', margin: '0 0 0.25rem', color: 'var(--text)' }}>
          Booking Agent Sign In
        </h1>
        <p className="text-sm text-muted" style={{ textAlign: 'center', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          For agent accounts only. Bands and band members sign in on the{' '}
          <Link href="/login" className="text-accent">
            band sign-in page
          </Link>
          .
        </p>

        {error && <ErrorBanner message={error} />}

        {wrongSide ? (
          <div role="status" className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', textAlign: 'center' }}>
            <p className="text-sm" style={{ color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>
              That login is a band account, not a Booking Agent account. Band accounts and agent accounts are kept separate.
            </p>
            <a className="btn btn-primary" href={wrongSide.home}>
              Go to my band workspace
            </a>
            <p className="text-xs text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
              Want to work as a booking agent too? Create a separate agent account with a different email.{' '}
              <Link href="/booker/signup" className="text-accent">
                Agent sign up
              </Link>
            </p>
          </div>
        ) : view === 'forgot-sent' ? (
          <div role="status" className="card" style={{ textAlign: 'center' }}>
            <p className="text-sm" style={{ color: 'var(--text)', lineHeight: 1.6 }}>
              If <strong>{email.trim()}</strong> has an account, a reset link is on its way. Open it to set a new password.
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => setView('sign-in')}>
              Back to sign in
            </button>
          </div>
        ) : view === 'forgot' ? (
          <form onSubmit={sendReset} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <Field label="Email" required>
              {p => <input {...p} className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoFocus />}
            </Field>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !email.trim()} aria-busy={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setView('sign-in')}>
              Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={signIn} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <Field label="Email" required>
              {p => <input {...p} className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoFocus />}
            </Field>
            <Field label="Password" required>
              {p => <input {...p} className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />}
            </Field>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy} aria-busy={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setError(''); setView('forgot'); }}>
              Forgot password?
            </button>
            <p className="text-sm text-muted" style={{ textAlign: 'center', margin: 0 }}>
              New booking agent?{' '}
              <Link href="/booker/signup" className="text-accent">
                Create an agent account
              </Link>
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
