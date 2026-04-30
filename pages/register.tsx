import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

type Tier = 'act_admin' | 'member';

const GOLD = '#C8921A';

const TIER_CONFIG: Record<Tier, {
  label: string; icon: string; color: string;
  price: string; desc: string; selfSignup: boolean; apiRole: string;
  features: string[]; badge?: string; note?: string;
}> = {
  act_admin: {
    label: 'Band Admin',
    icon:  '♪',
    color: GOLD,
    price: '$18/mo',
    desc:  'For independent bands and touring artists of any genre',
    selfSignup: true,
    apiRole: 'act_admin',
    badge: 'Recommended',
    features: [
      'Tour planning and management',
      'Venue discovery and database',
      'AI email outreach campaigns',
      'Booking pipeline management',
      'Calendar with iCal export',
      'Financial tracking and history',
      'Band member management',
      'Social media tools',
      'Show Day View for your crew',
    ],
  },
  member: {
    label: 'Member',
    icon:  '◉',
    color: '#94a3b8',
    price: 'Free',
    desc:  'For band members and crew',
    selfSignup: false,
    apiRole: 'member',
    note: 'Requires invitation from band manager',
    features: [
      'Tour Day View',
      'Show schedule and details',
      'Load-in and logistics info',
      'Band calendar access',
    ],
  },
};

export default function Register() {
  const router = useRouter();
  const [tier, setTier]       = useState<Tier | null>('act_admin');
  const [form, setForm]       = useState({
    email: '', password: '', confirmPassword: '',
    displayName: '',
    actName: '',
    inviteCode: '',
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const role = router.query.role as string;
    if (role === 'act_admin' || role === 'member') setTier(role as Tier);
  }, [router.query.role]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tier) return;
    setError('');

    if (tier === 'member') {
      const code = form.inviteCode.trim();
      if (!code) { setError('Invite code is required'); return; }
      router.push(`/join?token=${encodeURIComponent(code)}`);
      return;
    }

    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!form.displayName.trim()) { setError('Name is required'); return; }
    if (tier === 'act_admin' && !form.actName.trim()) { setError('Act / band name is required'); return; }

    setLoading(true);

    const body: Record<string, string> = {
      email: form.email,
      password: form.password,
      role: cfg!.apiRole,
      displayName: form.displayName,
    };
    if (tier === 'act_admin') { body.planTier = 'band_admin'; body.actName = form.actName; }

    const apiRes = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const apiData = await apiRes.json();
    if (!apiRes.ok) { setError(apiData.error || 'Registration failed'); setLoading(false); return; }

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    if (signInErr) { setError(signInErr.message); setLoading(false); return; }

    if (tier === 'act_admin') router.replace('/band');
    else router.replace('/member');
  };

  const cfg = tier ? TIER_CONFIG[tier] : null;

  return (
    <div className="auth-wrap" style={{ alignItems: 'flex-start', paddingTop: '2.5rem' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="auth-logo">CAMEL RANCH</div>
          <div className="auth-sub">Create Account</div>
        </div>

        {/* Step 1 — Tier selection (always visible, required) */}
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700,
            letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: '0.75rem', textAlign: 'center',
          }}>
            Step 1 — I am a...
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
            {(Object.entries(TIER_CONFIG) as [Tier, typeof TIER_CONFIG[Tier]][]).map(([t, c]) => {
              const selected = tier === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTier(t); setError(''); }}
                  style={{
                    padding: '1.1rem 0.75rem',
                    border: `2px solid ${selected ? c.color : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    background: selected ? `${c.color}18` : 'var(--bg-panel)',
                    color: selected ? c.color : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
                    position: 'relative',
                    textAlign: 'left',
                  }}
                >
                  {c.badge && (
                    <div style={{
                      position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                      background: c.color, color: '#000',
                      fontFamily: 'var(--font-body)', fontSize: '0.58rem', fontWeight: 700,
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                      padding: '0.15rem 0.55rem', whiteSpace: 'nowrap',
                    }}>{c.badge}</div>
                  )}
                  <span style={{ fontSize: '1.5rem', lineHeight: 1, marginTop: c.badge ? '0.5rem' : 0 }}>{c.icon}</span>
                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>{c.label}</span>
                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 400,
                    color: selected ? `${c.color}cc` : 'var(--text-muted)',
                    letterSpacing: '0.03em',
                  }}>{c.price}</span>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.4rem' }}>
                    {c.features.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.35rem', textAlign: 'left' }}>
                        <span style={{ color: c.color, fontSize: '0.62rem', flexShrink: 0, marginTop: '0.1rem' }}>✓</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: selected ? 'rgba(255,255,255,0.65)' : 'var(--text-muted)', lineHeight: 1.4 }}>{f}</span>
                      </div>
                    ))}
                    {c.note && (
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.3rem', fontStyle: 'italic' }}>{c.note}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2 — Form (only shown after tier is chosen) */}
        {tier && cfg && (
          <div className="auth-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '1.4rem', color: cfg.color }}>{cfg.icon}</span>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', letterSpacing: '0.04em', color: cfg.color }}>{cfg.label}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{cfg.desc}</div>
              </div>
            </div>

            {/* Member — invite only */}
            {tier === 'member' && (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: 'var(--bg-overlay)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 'var(--radius-sm)', padding: '0.9rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Band members join via invite link sent by their booking agent or band admin. Paste your invite token below.
                </div>
                <div className="field">
                  <label className="field-label">Invite Code / Token</label>
                  <input className="input" value={form.inviteCode} onChange={set('inviteCode')} placeholder="Paste invite token from your email..." autoFocus required />
                </div>
                {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 'var(--radius-sm)', padding: '0.6rem', color: '#f87171', fontSize: '0.85rem' }}>{error}</div>}
                <button className="btn btn-lg" type="submit" style={{ width: '100%', justifyContent: 'center', background: '#34d399', color: '#000', border: '1px solid #34d399' }}>
                  Continue with Invite
                </button>
                <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  No invite? Ask your booking agent or band admin.
                </div>
              </form>
            )}

            {/* Band Admin */}
            {tier === 'act_admin' && (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="grid-2">
                  <div className="field">
                    <label className="field-label">Your Name *</label>
                    <input className="input" value={form.displayName} onChange={set('displayName')} placeholder="Your name" required autoFocus />
                  </div>
                  <div className="field">
                    <label className="field-label">Act / Band Name *</label>
                    <input className="input" value={form.actName} onChange={set('actName')} placeholder="The Band Name" required />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Email *</label>
                  <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@yourband.com" required />
                </div>
                <div className="field">
                  <label className="field-label">Password *</label>
                  <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters" required />
                </div>
                <div className="field">
                  <label className="field-label">Confirm Password *</label>
                  <input className="input" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="Repeat password" required />
                </div>
                {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 'var(--radius-sm)', padding: '0.6rem', color: '#f87171', fontSize: '0.85rem' }}>{error}</div>}
                <button className="btn btn-lg" type="submit" disabled={loading}
                  style={{ width: '100%', justifyContent: 'center', background: '#a78bfa', color: '#000', border: '1px solid #a78bfa' }}>
                  {loading ? 'Creating account...' : 'Create Band Account'}
                </button>
                <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Band member?{' '}
                  <button type="button" onClick={() => setTier('member')} style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>
                    Use invite code instead
                  </button>
                </div>
              </form>
            )}

            <div style={{ textAlign: 'center', marginTop: '1.25rem', fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Already have an account? <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
            </div>
          </div>
        )}

        {!tier && (
          <div style={{ textAlign: 'center', marginTop: '1rem', fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Already have an account? <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
          </div>
        )}
      </div>
    </div>
  );
}
