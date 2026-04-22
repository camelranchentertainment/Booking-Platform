import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

type Tier = 'agent' | 'act_admin' | 'member';

const TIER_CONFIG: Record<Tier, { label: string; color: string; sub: string; selfSignup: boolean }> = {
  agent: {
    label: 'Booking Agent',
    color: 'var(--accent)',
    sub:   'Run a roster of bands',
    selfSignup: true,
  },
  act_admin: {
    label: 'Band Admin',
    color: '#a78bfa',
    sub:   'Self-managed or agent-connected',
    selfSignup: true,
  },
  member: {
    label: 'Band Member',
    color: '#34d399',
    sub:   'Individual member access',
    selfSignup: false,
  },
};

export default function Register() {
  const router = useRouter();
  const [tier, setTier]       = useState<Tier>('agent');
  const [form, setForm]       = useState({
    email: '', password: '', confirmPassword: '',
    displayName: '', agencyName: '',
    actName: '',   // for act_admin self-signup
    inviteCode: '', // for member invite
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const role = router.query.role as string;
    if (role === 'act_admin' || role === 'member' || role === 'agent') setTier(role as Tier);
  }, [router.query.role]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Members use invite flow
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

    const { data, error: err } = await supabase.auth.signUp({ email: form.email, password: form.password });
    if (err) { setError(err.message); setLoading(false); return; }
    if (!data.user) { setError('Registration failed'); setLoading(false); return; }

    const token = data.session?.access_token;
    if (!token) {
      setError('Could not obtain session after signup. Please check your email to confirm your account, then sign in.');
      setLoading(false);
      return;
    }

    const body: Record<string, string> = {
      role: tier,
      email: form.email,
      displayName: form.displayName,
    };
    if (tier === 'agent' && form.agencyName) body.agencyName = form.agencyName;
    if (tier === 'act_admin') body.actName = form.actName;

    const apiRes = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const apiData = await apiRes.json();
    if (!apiRes.ok) { setError(apiData.error || 'Registration failed'); setLoading(false); return; }

    router.replace(tier === 'agent' ? '/dashboard' : '/band');
  };

  const cfg = TIER_CONFIG[tier];

  return (
    <div className="auth-wrap" style={{ alignItems: 'flex-start', paddingTop: '3rem' }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div className="auth-logo">CAMEL RANCH</div>
          <div className="auth-sub">Create Account</div>
        </div>

        {/* Tier selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {(Object.entries(TIER_CONFIG) as [Tier, typeof TIER_CONFIG[Tier]][]).map(([t, c]) => (
            <button key={t} onClick={() => { setTier(t); setError(''); }}
              style={{
                padding: '0.75rem 0.5rem',
                border: `1px solid ${tier === t ? c.color : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                background: tier === t ? `rgba(255,255,255,0.06)` : 'var(--bg-raised)',
                color: tier === t ? c.color : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.62rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
              }}>
              <span style={{ fontSize: '1.1rem' }}>{t === 'agent' ? '◈' : t === 'act_admin' ? '♪' : '◉'}</span>
              {c.label}
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'none', fontFamily: 'var(--font-body)' }}>{c.sub}</span>
            </button>
          ))}
        </div>

        <div className="auth-card">
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', letterSpacing: '0.04em', color: cfg.color }}>{cfg.label}</div>
          </div>

          {/* Member invite flow */}
          {tier === 'member' && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-overlay)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 'var(--radius-sm)', padding: '0.9rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Individual band members join via invite from their booking agent or band admin.
              </div>
              <div className="field">
                <label className="field-label">Invite Code / Token</label>
                <input className="input" value={form.inviteCode} onChange={set('inviteCode')} placeholder="Paste invite token from your email..." autoFocus required />
              </div>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 'var(--radius-sm)', padding: '0.6rem', color: '#f87171', fontSize: '0.85rem' }}>{error}</div>}
              <button className="btn btn-lg" type="submit" style={{ width: '100%', justifyContent: 'center', background: '#34d399', color: '#000', border: '1px solid #34d399' }}>Continue with Invite</button>
              <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>No invite? Ask your booking agent or band admin.</div>
            </form>
          )}

          {/* Agent registration */}
          {tier === 'agent' && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label">Your Name *</label>
                  <input className="input" value={form.displayName} onChange={set('displayName')} placeholder="Scott" required autoFocus />
                </div>
                <div className="field">
                  <label className="field-label">Agency Name</label>
                  <input className="input" value={form.agencyName} onChange={set('agencyName')} placeholder="Camel Ranch Entertainment" />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Email *</label>
                <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@youragency.com" required />
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
              <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Creating account...' : 'Create Agent Account'}
              </button>
            </form>
          )}

          {/* Act Admin / Band registration */}
          {tier === 'act_admin' && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-overlay)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Register your act independently. You can connect with a booking agent later — they&apos;ll send you a link request and you choose whether to accept.
              </div>
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
              <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                Invited by an agent?{' '}
                <button type="button" onClick={() => setTier('member')} style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                  Use invite code instead
                </button>
              </div>
            </form>
          )}

          <div style={{ textAlign: 'center', marginTop: '1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Already have an account? <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
