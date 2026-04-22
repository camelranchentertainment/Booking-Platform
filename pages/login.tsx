import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

const REGISTER_TIERS = [
  { role: 'agent',     label: 'Booking Agent', icon: '◈', color: 'var(--accent)' },
  { role: 'act_admin', label: 'Band Admin',    icon: '♪', color: '#a78bfa' },
  { role: 'member',    label: 'Band Member',   icon: '◉', color: '#34d399' },
];

export default function Login() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Login failed'); setLoading(false); return; }

    const { data: profile } = await supabase
      .from('user_profiles').select('role').eq('id', user.id).maybeSingle();

    const role = profile?.role || 'agent';
    if (role === 'superadmin' || role === 'agent') router.replace('/dashboard');
    else if (role === 'act_admin') router.replace('/band');
    else router.replace('/member');
  };

  return (
    <div className="auth-wrap" style={{ flexDirection: 'column', gap: '1.5rem' }}>
      <div className="auth-card">
        <div className="auth-logo">CAMEL RANCH</div>
        <div className="auth-sub">Booking Platform</div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="field">
            <label className="field-label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label className="field-label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.75rem', color: '#f87171', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      {/* Account type selector — shown outside the sign-in card */}
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: '0.72rem', letterSpacing: '0.18em',
          textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center',
          marginBottom: '0.75rem',
        }}>
          New here? Choose your account type
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {REGISTER_TIERS.map(t => (
            <Link
              key={t.role}
              href={`/register?role=${t.role}`}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem',
                padding: '0.85rem 0.5rem',
                background: 'var(--bg-card)',
                border: `1px solid var(--border)`,
                borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = t.color;
                (e.currentTarget as HTMLAnchorElement).style.background = `${t.color}12`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-card)';
              }}
            >
              <span style={{ fontSize: '1.25rem', color: t.color }}>{t.icon}</span>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: t.color,
              }}>{t.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
