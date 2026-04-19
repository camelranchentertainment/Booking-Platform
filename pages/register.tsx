import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

export default function Register() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', displayName: '', agencyName: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);

    const { data, error: err } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (err) { setError(err.message); setLoading(false); return; }
    if (!data.user) { setError('Registration failed'); setLoading(false); return; }

    const { error: profileErr } = await supabase.from('user_profiles').insert({
      id:           data.user.id,
      role:         'agent',
      email:        form.email,
      display_name: form.displayName,
      agency_name:  form.agencyName,
    });

    if (profileErr) { setError(profileErr.message); setLoading(false); return; }

    router.replace('/dashboard');
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <div className="auth-logo">CAMEL RANCH</div>
        <div className="auth-sub">Create Agent Account</div>

        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">Your Name</label>
              <input className="input" value={form.displayName} onChange={set('displayName')} placeholder="Scott" required />
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

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
