// pages/beta.tsx
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import BrandLogo from '../components/BrandLogo';
import { LANDING as T } from '../components/public/landingTheme';
import { SHOWS_PER_YEAR_OPTIONS } from '../lib/domain/betaProgram';

type FormState = {
  applicantName: string;
  email: string;
  actName: string;
  genre: string;
  homeBase: string;
  showsPerYear: string;
  bookingMethod: string;
  websiteUrl: string;
  agentName: string;
  feedbackAgreed: boolean;
  companySite: string; // honeypot — hidden from people, filled by bots
};

const EMPTY: FormState = {
  applicantName: '', email: '', actName: '', genre: '', homeBase: '',
  showsPerYear: '', bookingMethod: '', websiteUrl: '', agentName: '',
  feedbackAgreed: false, companySite: '',
};

type Phase = 'loading' | 'open' | 'closed' | 'sent';

const TEXT_FIELDS: { name: keyof FormState; label: string; type: string; required: boolean; autoComplete?: string; hint?: string }[] = [
  { name: 'applicantName', label: 'Your name',                        type: 'text',  required: true,  autoComplete: 'name' },
  { name: 'email',         label: 'Email',                            type: 'email', required: true,  autoComplete: 'email', hint: 'Use the email you’ll sign up with — the free year is applied to that account.' },
  { name: 'actName',       label: 'Act name',                         type: 'text',  required: true,  autoComplete: 'organization' },
  { name: 'genre',         label: 'Genre',                            type: 'text',  required: true },
  { name: 'homeBase',      label: 'Home base (city, state)',          type: 'text',  required: true,  autoComplete: 'address-level2' },
];

const OPTIONAL_FIELDS: { name: keyof FormState; label: string; type: string; autoComplete?: string }[] = [
  { name: 'websiteUrl', label: 'Website or social link', type: 'url',  autoComplete: 'url' },
  { name: 'agentName',  label: 'Booking agent or manager, if any', type: 'text' },
];

/**
 * Founding beta application. Shows the form while spots remain; once the cap
 * is reached it shows a closed message instead, even when reached by direct link.
 */
export default function BetaApplyPage() {
  const [phase, setPhase]   = useState<Phase>('loading');
  const [form, setForm]     = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch('/api/public/beta-status')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((s: { open: boolean }) => setPhase(s.open ? 'open' : 'closed'))
      // If the status check fails, show the form: the server re-checks on submit.
      .catch(() => setPhase('open'));
  }, []);

  const set = (name: keyof FormState, value: string | boolean) => {
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(e => { const next = { ...e }; delete next[name]; return next; });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setFormErr('');
    setSending(true);
    try {
      const res = await fetch('/api/public/beta-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setPhase('sent'); return; }
      if (res.status === 400 && data.fields) {
        setErrors(data.fields);
        setFormErr(data.error || 'Please fix the highlighted fields.');
        // Move focus to the first invalid field so keyboard and screen-reader users land on it.
        const first = Object.keys(data.fields)[0];
        if (first) document.getElementById(`beta-${first}`)?.focus();
        return;
      }
      setFormErr(data.error || 'Something went wrong. Please try again.');
    } catch {
      setFormErr('Network error. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Head>
        <title>Founding Beta — Camel Ranch Booking</title>
        <meta name="description" content="Apply for a free year of Camel Ranch Booking as one of our 10 founding beta bands." />
      </Head>
      <style>{`
        .beta-input {
          width: 100%; box-sizing: border-box; background: transparent; color: ${T.cream};
          font: inherit; font-size: 0.95rem; padding: 0.7rem 0;
          border: none; border-bottom: 1px solid rgba(239,224,189,0.22); border-radius: 0;
        }
        .beta-input:focus-visible { outline: 2px solid ${T.gold}; outline-offset: 4px; border-bottom-color: ${T.gold}; }
        .beta-input[aria-invalid="true"] { border-bottom-color: ${T.error}; }
        .beta-label { display: block; color: rgba(239,224,189,0.7); font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 0.25rem; }
        .beta-hp { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
        .beta-btn:focus-visible, .beta-link:focus-visible { outline: 2px solid ${T.cream}; outline-offset: 3px; }
      `}</style>

      <div style={{ minHeight: '100vh', background: T.bg, color: T.cream, fontFamily: 'var(--font-body)' }}>
        <header style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${T.border}` }}>
          <Link href="/" aria-label="Camel Ranch Booking home" className="beta-link"><BrandLogo variant="banner" height={44} /></Link>
        </header>

        <main style={{ maxWidth: '40rem', margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, textTransform: 'uppercase',
            fontSize: 'clamp(2.2rem,7vw,3.5rem)', lineHeight: 1, margin: '0 0 1rem',
          }}>
            Apply for a Founding Beta Spot
          </h1>

          {phase === 'loading' && (
            <p role="status" style={{ color: T.muted }}>Checking available spots…</p>
          )}

          {phase === 'closed' && (
            <div role="status">
              <p style={{ color: 'rgba(239,224,189,0.7)', fontSize: '1rem', lineHeight: 1.7 }}>
                Our founding beta is full — thank you. Camel Ranch Booking is open to everyone with a 14-day free trial.
              </p>
              <Link href="/register" className="beta-link" style={{
                display: 'inline-block', marginTop: '1rem', padding: '0.85rem 2rem', background: T.gold, color: T.bg,
                fontWeight: 700, letterSpacing: '0.2em', fontSize: '0.75rem', textTransform: 'uppercase', textDecoration: 'none',
              }}>
                Get Started
              </Link>
            </div>
          )}

          {phase === 'sent' && (
            <div role="status">
              <p style={{ color: 'rgba(239,224,189,0.8)', fontSize: '1.05rem', lineHeight: 1.7 }}>
                Thanks — your application is in. I review every one by hand and will reply within 48 hours.
              </p>
              <p style={{ color: T.gold, letterSpacing: '0.18em', fontSize: '0.75rem', textTransform: 'uppercase' }}>— Scott</p>
              <Link href="/" className="beta-link" style={{ color: T.gold, fontSize: '0.85rem' }}>Back to the homepage</Link>
            </div>
          )}

          {phase === 'open' && (
            <>
              <p style={{ color: 'rgba(239,224,189,0.62)', fontSize: '0.95rem', lineHeight: 1.7, margin: '0 0 2.25rem' }}>
                Founding bands get a full year of Band Admin access free, AI booking agent included. In return, I ask for honest feedback on how it works for you. Fields marked * are required.
              </p>

              <form onSubmit={submit} noValidate>
                {formErr && (
                  <div role="alert" style={{ color: T.error, fontSize: '0.88rem', marginBottom: '1.5rem' }}>{formErr}</div>
                )}

                {TEXT_FIELDS.map(f => (
                  <Field key={f.name} id={`beta-${f.name}`} label={`${f.label} *`} hint={f.hint} error={errors[f.name]}>
                    <input
                      id={`beta-${f.name}`} name={f.name} type={f.type} className="beta-input"
                      required autoComplete={f.autoComplete} value={String(form[f.name])}
                      onChange={e => set(f.name, e.target.value)}
                      aria-invalid={errors[f.name] ? true : undefined}
                      aria-describedby={describedBy(f.name, errors, Boolean(f.hint))}
                    />
                  </Field>
                ))}

                <fieldset style={{ border: 'none', margin: '0 0 1.75rem', padding: 0 }}
                  aria-describedby={errors.showsPerYear ? 'beta-showsPerYear-error' : undefined}>
                  <legend className="beta-label" style={{ marginBottom: '0.6rem' }}>Shows per year, roughly *</legend>
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    {SHOWS_PER_YEAR_OPTIONS.map((o, i) => (
                      <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: 44, cursor: 'pointer' }}>
                        <input
                          id={i === 0 ? 'beta-showsPerYear' : undefined}
                          type="radio" name="showsPerYear" value={o.value}
                          checked={form.showsPerYear === o.value}
                          onChange={() => set('showsPerYear', o.value)}
                          style={{ width: 18, height: 18, accentColor: T.gold }}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  {errors.showsPerYear && <FieldError id="beta-showsPerYear-error" message={errors.showsPerYear} />}
                </fieldset>

                <Field id="beta-bookingMethod" label="How do you book shows today? *" error={errors.bookingMethod}>
                  <textarea
                    id="beta-bookingMethod" name="bookingMethod" className="beta-input" rows={3} required maxLength={1000}
                    value={form.bookingMethod} onChange={e => set('bookingMethod', e.target.value)}
                    aria-invalid={errors.bookingMethod ? true : undefined}
                    aria-describedby={describedBy('bookingMethod', errors, false)}
                  />
                </Field>

                {OPTIONAL_FIELDS.map(f => (
                  <Field key={f.name} id={`beta-${f.name}`} label={f.label} error={errors[f.name]}>
                    <input
                      id={`beta-${f.name}`} name={f.name} type={f.type} className="beta-input"
                      autoComplete={f.autoComplete} value={String(form[f.name])}
                      onChange={e => set(f.name, e.target.value)}
                      aria-invalid={errors[f.name] ? true : undefined}
                      aria-describedby={describedBy(f.name, errors, false)}
                    />
                  </Field>
                ))}

                {/* Honeypot: off-screen and skipped by keyboard and assistive tech. */}
                <div className="beta-hp" aria-hidden="true">
                  <label htmlFor="beta-companySite">Company site</label>
                  <input id="beta-companySite" name="companySite" type="text" tabIndex={-1} autoComplete="off"
                    value={form.companySite} onChange={e => set('companySite', e.target.value)} />
                </div>

                <div style={{ margin: '0.5rem 0 2rem' }}>
                  <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', cursor: 'pointer', lineHeight: 1.6, fontSize: '0.92rem', color: 'rgba(239,224,189,0.8)' }}>
                    <input
                      id="beta-feedbackAgreed" type="checkbox" checked={form.feedbackAgreed}
                      onChange={e => set('feedbackAgreed', e.target.checked)}
                      aria-invalid={errors.feedbackAgreed ? true : undefined}
                      aria-describedby={errors.feedbackAgreed ? 'beta-feedbackAgreed-error' : undefined}
                      style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, accentColor: T.gold }}
                    />
                    <span>I&rsquo;ll share honest feedback on my experience, including bugs and suggestions, during the beta year. *</span>
                  </label>
                  {errors.feedbackAgreed && <FieldError id="beta-feedbackAgreed-error" message={errors.feedbackAgreed} />}
                </div>

                <button type="submit" disabled={sending} aria-busy={sending} className="beta-btn" style={{
                  width: '100%', minHeight: 48, padding: '1rem', border: 'none',
                  background: sending ? 'rgba(224,120,32,0.55)' : T.gold, color: T.bg,
                  fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.25em', textTransform: 'uppercase',
                  cursor: sending ? 'wait' : 'pointer', fontFamily: 'inherit',
                }}>
                  {sending ? 'Sending…' : 'Send Application'}
                </button>

                <p style={{ color: 'rgba(239,224,189,0.45)', fontSize: '0.75rem', lineHeight: 1.6, marginTop: '1.25rem' }}>
                  When your free year ends, nothing is charged automatically — you choose whether to continue at the regular Band Admin price.
                </p>
              </form>
            </>
          )}
        </main>
      </div>
    </>
  );
}

function describedBy(name: string, errors: Record<string, string>, hasHint: boolean): string | undefined {
  const ids = [hasHint ? `beta-${name}-hint` : '', errors[name] ? `beta-${name}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

function Field({ id, label, hint, error, children }: {
  id: string; label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <label htmlFor={id} className="beta-label">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} style={{ color: T.muted, fontSize: '0.78rem', margin: '0.4rem 0 0', lineHeight: 1.5 }}>{hint}</p>}
      {error && <FieldError id={`${id}-error`} message={error} />}
    </div>
  );
}

function FieldError({ id, message }: { id: string; message: string }) {
  return <p id={id} style={{ color: T.error, fontSize: '0.8rem', margin: '0.4rem 0 0' }}>{message}</p>;
}
