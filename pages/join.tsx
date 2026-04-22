import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

export default function Join() {
  const router = useRouter();
  const { token } = router.query;
  const [invite, setInvite]     = useState<any>(null);
  const [mode, setMode]         = useState<'login' | 'register'>('register');
  const [form, setForm]         = useState({ email: '', password: '', displayName: '' });
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/invite-info?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return; }
        setInvite(data);
        setForm(f => ({ ...f, email: data.email || '' }));
        setLoading(false);
      });
  }, [token]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    let userId: string;

    if (mode === 'register') {
      const { data, error: err } = await supabase.auth.signUp({ email: form.email, password: form.password });
      if (err) { setError(err.message); setSaving(false); return; }
      if (!data.user) { setError('Registration failed'); setSaving(false); return; }
      userId = data.user.id;
    } else {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (err) { setError(err.message); setSaving(false); return; }
      userId = data.user!.id;
    }

    // Accept invite via API
    const res = await fetch('/api/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, userId, displayName: form.displayName }),
    });
    const result = await res.json();
    if (!res.ok) { setError(result.error || 'Failed to accept invite'); setSaving(false); return; }

    const role = invite?.role;
    if (role === 'act_admin') router.replace('/band');
    else router.replace('/member');
  };

  if (loading) return (
    <div className="auth-wrap">
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-muted)', letterSpacing: '0.15em' }}>Loading invite...</div>
    </div>
  );

  if (error && !invite) return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-logo">CAMEL RANCH</div>
        <div style={{ color: '#f87171', marginTop: '1rem', fontSize: '0.9rem' }}>{error}</div>
      </div>
    </div>
  );

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 440 }}>
        <div className="auth-logo">CAMEL RANCH</div>
        <div className="auth-sub">You've been invited</div>

        {invite && (
          <div style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent-dim)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--accent)' }}>{invite.actName}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.2rem' }}>
              Role: {invite.role}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0', marginBottom: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {(['register', 'login'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '0.5rem', fontFamily: 'var(--font-body)', fontSize: '0.82rem', letterSpacing: '0.08em', textTransform: 'uppercase',
              background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? '#000' : 'var(--text-muted)', border: 'none', cursor: 'pointer',
            }}>
              {m === 'register' ? 'New Account' : 'Sign In'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {mode === 'register' && (
            <div className="field">
              <label className="field-label">Your Name</label>
              <input className="input" value={form.displayName} onChange={set('displayName')} placeholder="Your name" required />
            </div>
          )}
          <div className="field">
            <label className="field-label">Email</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters" required minLength={8} />
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.75rem', color: '#f87171', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg" disabled={saving} style={{ width: '100%', justifyContent: 'center', marginTop: '0.25rem' }}>
            {saving ? 'Joining...' : 'Accept Invitation'}
          </button>
        </form>
      </div>
    </div>
  );
}
