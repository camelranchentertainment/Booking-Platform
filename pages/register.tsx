import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

type Tier = 'agent' | 'act_admin' | 'member';

const TIER_CONFIG = {
  agent: {
    label:   'Booking Agent',
    color:   'var(--accent)',
    sub:     'Create your agency account',
    desc:    'Manage your roster, run the booking pipeline, and grow your acts.',
  },
  act_admin: {
    label:   'Act Admin',
    color:   '#a78bfa',
    sub:     'Join your act',
    desc:    'Your booking agent will send you an invite link. Paste your invite code below.',
  },
  member: {
    label:   'Band Member',
    color:   '#34d399',
    sub:     'Join your act',
    desc:    'Your booking agent will send you an invite link. Paste your invite code below.',
  },
};

export default function Register() {
  const router = useRouter();
  const [tier, setTier] = useState<Tier>('agent');
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', displayName: '', agencyName: '', inviteCode: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const role = router.query.role as string;
    if (role === 'act_admin' || role === 'member') setTier(role);
    else if (role === 'agent') setTier('agent');
  }, [router.query.role]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Band / member tiers use invite code — redirect to join flow
    if (tier !== 'agent') {
      const code = form.inviteCode.trim();
      if (!code) { setError('Invite code is required'); return; }
      router.push(`/join?token=${encodeURIComponent(code)}`);
      return;
    }

    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);

    const { data, error: err } = await supabase.auth.signUp({ email: form.email, password: form.password });
    if (err) { setError(err.message); setLoading(false); return; }
    if (!data.user) { setError('Registration failed'); setLoading(false); return; }

    const { error: profileErr } = await supabase.from('user_profiles').insert({
      id:           data.user.id,
      role:         'agent',
      email:        form.email,
      display_name: form.displayName,
      agency_name:  form.agencyName || null,
    });

    if (profileErr) { setError(profileErr.message); setLoading(false); return; }
    router.replace('/dashboard');
  };

  const cfg = TIER_CONFIG[tier];

  return (
    <div className="auth-wrap" style={{ alignItems: 'flex-start', paddingTop: '3rem' }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="auth-logo">CAMEL RANCH</div>
          <div className="auth-sub">Create Account</div>
        </div>

        {/* Tier selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.75rem' }}>
          {(Object.entries(TIER_CONFIG) as [Tier, typeof TIER_CONFIG[Tier]][]).map(([t, c]) => (
            <button key={t} onClick={() => { setTier(t); setError(''); }}
              style={{
                padding: '0.75rem 0.5rem',
                border: `1px solid ${tier === t ? c.color : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                background: tier === t ? `color-mix(in srgb, ${c.color} 12%, transparent)` : 'var(--bg-raised)',
                color: tier === t ? c.color : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.2rem',
              }}>
              <span style={{ fontSize: '1rem' }}>{t === 'agent' ? '◈' : t === 'act_admin' ? '♪' : '◉'}</span>
              {c.label}
            </button>
          ))}
        </div>

        <div className="auth-card">
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', letterSpacing: '0.04em', color: cfg.color }}>{cfg.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{cfg.sub}</div>
          </div>

          {/* Band / Member — invite code flow */}
          {tier !== 'agent' ? (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-overlay)', border: `1px solid ${cfg.color}33`, borderRadius: 'var(--radius-sm)', padding: '0.9rem 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {cfg.desc}
              </div>

              <div className="field">
                <label className="field-label">Invite Code or Token</label>
                <input
                  className="input"
                  value={form.inviteCode}
                  onChange={set('inviteCode')}
                  placeholder="Paste your invite token here..."
                  autoFocus
                  required
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  From the invite link your agent sent: <code style={{ color: cfg.color }}>/join?token=...</code>
                </span>
              </div>

              {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.75rem', color: '#f87171', fontSize: '0.85rem' }}>
                  {error}
                </div>
              )}

              <button className="btn btn-lg" type="submit"
                style={{ width: '100%', justifyContent: 'center', background: cfg.color, color: '#000', border: `1px solid ${cfg.color}` }}>
                Continue with Invite
              </button>

              <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                Don&apos;t have an invite? Ask your booking agent.
              </div>
            </form>
          ) : (
            /* Agent registration form */
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label">Your Name</label>
                  <input className="input" value={form.displayName} onChange={set('displayName')} placeholder="Scott" required autoFocus />
                </div>
                <div className="field">
                  <label className="field-label">Agency Name</label>
                  <input className="input" value={form.agencyName} onChange={set('agencyName')} placeholder="Camel Ranch Entertainment" />
                </div>
              </div>

              <div className="field">
                <label className="field-label">Email</label>
                <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@youragency.com" required />
              </div>

              <div className="field">
                <label className="field-label">Password</label>
                <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters" required />
              </div>

              <div className="field">
                <label className="field-label">Confirm Password</label>
                <input className="input" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="Repeat password" required />
              </div>

              {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.75rem', color: '#f87171', fontSize: '0.85rem' }}>
                  {error}
                </div>
              )}

              <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: '0.25rem' }}>
                {loading ? 'Creating account...' : 'Create Agent Account'}
              </button>
            </form>
          )}

          <div style={{ textAlign: 'center', marginTop: '1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
