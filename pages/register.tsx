// pages/register.tsx — band sign-up (and the doorway for invited members).
//
// Most visitors arrive from an ad or a post promising a 14-day free trial, so the
// page leads with that offer and puts the form right under it. Plan feature
// lists sit below the form: the home page does the selling, this page should
// only get a band started.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import BrandLogo from '../components/BrandLogo';
import { trackCompleteRegistration } from '../lib/metaPixel';
import styles from '../styles/Register.module.css';

type Tier = 'band_admin' | 'member';

/** Band admin price and trial, shown in the offer line and the role picker. */
const BAND_PRICE = '$18/mo';
const TRIAL_DAYS = 14;
const MIN_PASSWORD = 8;

const BAND_FEATURES = [
  'Tours, calendar and show day sheets',
  'Venue database and AI outreach emails',
  'Booking pipeline and follow-ups',
  'Band pay and money tracking',
  'Free accounts for your band members',
  'AI booking agent that knows your band',
];

type FormState = {
  email: string;
  password: string;
  displayName: string;
  actName: string;
  inviteCode: string;
  signupCode: string;
};

const EMPTY_FORM: FormState = {
  email: '', password: '', displayName: '', actName: '', inviteCode: '', signupCode: '',
};

const SIGNED_UP_NOT_IN = 'Your account was created, but we couldn’t sign you in automatically.';

/**
 * Checks the band sign-up fields before anything is sent.
 * @returns A message for the first problem found, or null when the form is ready.
 */
function validateBandForm(form: FormState): string | null {
  if (!form.displayName.trim()) return 'Please enter your name.';
  if (!form.actName.trim()) return 'Please enter your band or act name.';
  if (!form.email.trim()) return 'Please enter your email.';
  if (form.password.length < MIN_PASSWORD) return `Your password needs at least ${MIN_PASSWORD} characters.`;
  return null;
}

/**
 * Reads the register API's reply without throwing on a non-JSON body
 * (a gateway error page, for example).
 */
async function readJson(res: Response): Promise<{ error?: string; codeApplied?: boolean }> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export default function Register() {
  const router = useRouter();
  const [tier, setTier]       = useState<Tier>('band_admin');
  const [form, setForm]       = useState<FormState>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  // Set when a code was entered but could not be applied (e.g. all uses taken): sign-up still succeeded.
  const [codeNotice, setCodeNotice] = useState('');

  useEffect(() => {
    const role = router.query.role;
    if (role === 'band_admin' || role === 'member') setTier(role);
    // A shared link can carry a code (?code=BETA): open the field with it filled in.
    const code = router.query.code;
    if (typeof code === 'string' && code.trim()) {
      setForm(f => ({ ...f, signupCode: code.trim().slice(0, 40) }));
      setShowCode(true);
    }
  }, [router.query.role, router.query.code]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const chooseTier = (t: Tier) => { setTier(t); setError(''); };

  const handleMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.inviteCode.trim();
    if (!code) { setError('Paste the invite code from your email.'); return; }
    router.push(`/join?token=${encodeURIComponent(code)}`);
  };

  const handleBandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const problem = validateBandForm(form);
    if (problem) { setError(problem); return; }

    setLoading(true);
    const body: Record<string, string> = {
      email: form.email.trim(),
      password: form.password,
      role: 'band_admin',
      displayName: form.displayName.trim(),
      planTier: 'band_admin',
      actName: form.actName.trim(),
    };
    if (form.signupCode.trim()) body.signupCode = form.signupCode.trim();

    try {
      const apiRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const apiData = await readJson(apiRes);
      if (!apiRes.ok) {
        setError(apiData.error || 'We couldn’t create your account. Please try again.');
        setLoading(false);
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: body.email, password: form.password });
      if (signInErr) {
        // The account exists; only the automatic sign-in failed, so send them to Sign in, not back through sign-up.
        console.error('[register] automatic sign-in after sign-up failed', signInErr.message);
        setError(SIGNED_UP_NOT_IN);
        setLoading(false);
        return;
      }

      trackCompleteRegistration();

      if (body.signupCode && apiData.codeApplied === false) {
        // Account exists and is signed in; tell them the code did not apply before moving on.
        setCodeNotice(`Your account is ready, but that code is no longer valid, so you have the standard ${TRIAL_DAYS}-day free trial.`);
        setLoading(false);
        return;
      }

      router.replace('/band');
    } catch (err) {
      console.error('[register] sign-up request failed', err);
      setError('We couldn’t reach Camel Ranch Booking. Check your connection and try again.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap" style={{ alignItems: 'flex-start', paddingTop: '1.75rem' }}>
      <div className={styles.wrap}>

        <header className={styles.header}>
          <BrandLogo variant="banner" height={44} />
          {tier === 'band_admin' ? (
            <>
              <h1 className={styles.title}>Start your free trial</h1>
              <p className={styles.offer}>
                <strong>{TRIAL_DAYS} days free. No credit card.</strong>{' '}
                Then {BAND_PRICE} for your whole band. Cancel anytime.
              </p>
            </>
          ) : (
            <>
              <h1 className={styles.title}>Join your band</h1>
              <p className={styles.offer}>Band members are always free. Use the invite your band admin sent you.</p>
            </>
          )}
        </header>

        <div className={styles.roles} role="group" aria-label="I am signing up as">
          <button
            type="button"
            aria-pressed={tier === 'band_admin'}
            onClick={() => chooseTier('band_admin')}
            className={`${styles.role} ${tier === 'band_admin' ? styles.roleSelected : ''}`}
          >
            <span className={styles.roleName}>I run a band</span>
            <span className={styles.roleNote}>Free trial, then {BAND_PRICE}</span>
          </button>
          <button
            type="button"
            aria-pressed={tier === 'member'}
            onClick={() => chooseTier('member')}
            className={`${styles.role} ${tier === 'member' ? styles.roleSelected : ''}`}
          >
            <span className={styles.roleName}>I was invited</span>
            <span className={styles.roleNote}>Band member · always free</span>
          </button>
        </div>

        <div className={styles.card}>
          {tier === 'member' ? (
            <form onSubmit={handleMemberSubmit} className={styles.form} noValidate>
              <div className="field">
                <label className="field-label" htmlFor="reg-invite">Invite code</label>
                <input
                  id="reg-invite" className="input" value={form.inviteCode} onChange={set('inviteCode')}
                  placeholder="Paste the code from your invite email" autoComplete="off" spellCheck={false}
                />
              </div>
              {error && <div role="alert" className={styles.alert}>{error}</div>}
              <button className={`btn btn-lg ${styles.submit}`} type="submit">Continue with invite</button>
              <p className={styles.reassure}>No invite yet? Ask your band admin to send you one.</p>
            </form>
          ) : (
            <form onSubmit={handleBandSubmit} className={styles.form} noValidate>
              <div className={styles.row}>
                <div className="field">
                  <label className="field-label" htmlFor="reg-name">Your name</label>
                  <input id="reg-name" className="input" value={form.displayName} onChange={set('displayName')}
                    autoComplete="name" placeholder="Your name" />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="reg-act">Band / act name</label>
                  <input id="reg-act" className="input" value={form.actName} onChange={set('actName')}
                    autoComplete="organization" placeholder="The Band Name" />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="reg-email">Email</label>
                <input id="reg-email" className="input" type="email" inputMode="email" value={form.email} onChange={set('email')}
                  autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@yourband.com" />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="reg-password">Password</label>
                <div className={styles.passwordBox}>
                  <input id="reg-password" className="input" type={showPassword ? 'text' : 'password'}
                    value={form.password} onChange={set('password')} autoComplete="new-password"
                    aria-describedby="reg-password-hint" minLength={MIN_PASSWORD} style={{ width: '100%' }} />
                  <button type="button" className={styles.showToggle} onClick={() => setShowPassword(v => !v)}
                    aria-controls="reg-password" aria-pressed={showPassword}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div id="reg-password-hint" className={styles.hint}>At least {MIN_PASSWORD} characters.</div>
              </div>

              {showCode ? (
                <div className="field">
                  <label className="field-label" htmlFor="reg-code">Signup code</label>
                  <input
                    id="reg-code" className="input" value={form.signupCode} onChange={set('signupCode')}
                    placeholder="Enter your code" autoComplete="off" autoCapitalize="characters"
                    spellCheck={false} maxLength={40} disabled={!!codeNotice}
                  />
                </div>
              ) : (
                <button type="button" className={styles.linkButton} onClick={() => setShowCode(true)}>
                  Have a signup code?
                </button>
              )}

              {error && (
                <div role="alert" className={styles.alert}>
                  {error}
                  {error === SIGNED_UP_NOT_IN && (
                    <> <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in to continue</Link></>
                  )}
                </div>
              )}

              {codeNotice ? (
                <>
                  <div role="status" className={styles.notice}>{codeNotice}</div>
                  <button className={`btn btn-lg ${styles.submit}`} type="button" onClick={() => router.replace('/band')}>
                    Continue
                  </button>
                </>
              ) : (
                <button className={`btn btn-lg ${styles.submit}`} type="submit" disabled={loading} aria-busy={loading}>
                  {loading ? 'Setting up your band…' : 'Start my free trial'}
                </button>
              )}
              <p className={styles.reassure}>No credit card needed · Your band members join free</p>
            </form>
          )}
        </div>

        {tier === 'band_admin' && (
          <ul className={styles.features} aria-label="What your band gets">
            {BAND_FEATURES.map(f => <li key={f}>{f}</li>)}
          </ul>
        )}

        <Link href="/agent/signup" className={styles.agentLink}>
          <span><strong>Booking agent?</strong> Manage several bands in an agent workspace.</span>
          <span aria-hidden="true" style={{ color: 'var(--accent)', fontWeight: 700 }}>→</span>
        </Link>

        <div className={styles.footer}>
          Already have an account? <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
