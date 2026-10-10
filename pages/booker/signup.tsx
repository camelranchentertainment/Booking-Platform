// pages/booker/signup.tsx
// Public sign-up for Booking Agents who don't have a Camel Ranch account yet.
// People who already have an account sign in and open /booker instead.

import { useState, type FormEvent } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import BrandLogo from '../../components/BrandLogo';
import { ErrorBanner, Field } from '../../components/booker/ui';
import { BookerSignupSchema, fieldErrors } from '../../lib/booker/schemas';
import { AGENT_TIERS } from '../../lib/booker/pricing';

export default function BookerSignup() {
  const [form, setForm] = useState({ displayName: '', agencyName: '', email: '', password: '', confirmPassword: '', signupCode: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setFormError('');
    const parsed = BookerSignupSchema.safeParse(form);
    const errs = parsed.success ? {} : fieldErrors(parsed.error);
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    if (!parsed.success || Object.keys(errs).length > 0) {
      setErrors(errs);
      const target = e.currentTarget;
      requestAnimationFrame(() => target.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setErrors({});
    setBusy(true);

    try {
      const res = await fetch('/api/booker/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, signupCode: form.signupCode.trim() || undefined }),
      });
      const body: { ok?: boolean; error?: string; codeApplied?: boolean } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(body.error ?? 'Could not create your account. Please try again.');
        setBusy(false);
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
      if (signInErr) {
        setFormError('Your account was created, but signing in failed. Go to the sign-in page and log in.');
        setBusy(false);
        return;
      }

      if (form.signupCode.trim() && body.codeApplied === false) {
        setNotice('Your account is ready, but that code is no longer valid, so you have the standard free trial.');
        setBusy(false);
        return;
      }
      window.location.href = '/booker';
    } catch {
      setFormError('Network problem. Check your connection and try again.');
      setBusy(false);
    }
  };

  const standard = AGENT_TIERS[0];

  return (
    <div className="auth-wrap" style={{ alignItems: 'flex-start', paddingTop: '2.5rem' }}>
      <Head>
        <title>Booking Agent sign up · Camel Ranch Booking</title>
        <meta name="description" content="A workspace for independent booking agents: every band you carry, their shows, your venues and contacts, and your commission in one place." />
      </Head>
      <main className="auth-card" style={{ maxWidth: 560, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <BrandLogo variant="square" height={72} />
        </div>
        <h1 className="display" style={{ fontSize: '2.1rem', textAlign: 'center', margin: '0 0 0.25rem', color: 'var(--text)' }}>
          For Booking Agents
        </h1>
        <p className="text-sm text-muted" style={{ textAlign: 'center', lineHeight: 1.6, marginBottom: '0.5rem' }}>
          Every band you carry in one place: shows, holds, your venue book and contacts, and the commission each band owes you.
        </p>
        <p className="text-xs text-muted" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          ${standard.monthlyUsd}/month after your free trial · Have a beta code? Enter it below.
        </p>

        {formError && <ErrorBanner message={formError} />}
        {notice ? (
          <div role="status" className="card" style={{ textAlign: 'center' }}>
            <p className="text-sm" style={{ color: 'var(--text)' }}>
              {notice}
            </p>
            <Link className="btn btn-primary" href="/booker">
              Open my workspace
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div className="grid-2">
              <Field label="Your name" required error={errors.displayName}>
                {p => <input {...p} className="input" value={form.displayName} onChange={set('displayName')} autoComplete="name" />}
              </Field>
              <Field label="Agency name" required error={errors.agencyName}>
                {p => <input {...p} className="input" value={form.agencyName} onChange={set('agencyName')} autoComplete="organization" />}
              </Field>
            </div>
            <Field label="Email" required error={errors.email}>
              {p => <input {...p} className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" />}
            </Field>
            <div className="grid-2">
              <Field label="Password" required hint="At least 8 characters" error={errors.password}>
                {p => <input {...p} className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />}
              </Field>
              <Field label="Confirm password" required error={errors.confirmPassword}>
                {p => <input {...p} className="input" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />}
              </Field>
            </div>
            <Field label="Signup code" hint="Optional — beta testers get one from Camel Ranch" error={errors.signupCode}>
              {p => <input {...p} className="input" value={form.signupCode} onChange={set('signupCode')} autoCapitalize="characters" />}
            </Field>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy} aria-busy={busy}>
              {busy ? 'Creating your workspace…' : 'Create my workspace'}
            </button>
            <p className="text-sm text-muted" style={{ textAlign: 'center', margin: 0 }}>
              Already have a Camel Ranch account?{' '}
              <Link href="/login?next=/booker" className="text-accent">
                Sign in
              </Link>{' '}
              and you can add a Booking Agent workspace to it.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
