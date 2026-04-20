import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

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
    <div className="auth-wrap">
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

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          New agent?{' '}
          <Link href="/register" style={{ color: 'var(--accent)' }}>Create account</Link>
        </div>
      </div>
    </div>
  );
}
