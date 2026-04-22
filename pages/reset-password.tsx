import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

const BG   = '#080201';
const GOLD = '#E2B84A';
const MUTED = 'rgba(226,184,74,0.55)';
const GLOW  = '0 0 18px rgba(226,184,74,0.42), 0 0 48px rgba(226,184,74,0.14)';

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(226,184,74,0.2)',
  borderRadius: '3px', padding: '0.65rem 0.85rem',
  color: '#F5EDDF', fontFamily: 'var(--font-body)', fontSize: '0.9rem', outline: 'none',
};

export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady]       = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when user lands here from the reset email
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return; }
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(() => router.replace('/login'), 2500);
  };

  return (
    <div style={{
      minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '2rem 1.25rem',
      backgroundImage: `
        radial-gradient(ellipse 120% 60% at 10% 0%, rgba(90,35,10,0.65) 0%, transparent 55%),
        radial-gradient(ellipse 80% 50% at 90% 100%, rgba(60,20,5,0.50) 0%, transparent 50%)
      `,
    }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem', letterSpacing: '0.14em', color: GOLD, textShadow: GLOW, lineHeight: 1 }}>
          CAMEL RANCH
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', letterSpacing: '0.45em', textTransform: 'uppercase', color: MUTED, marginTop: '0.35rem' }}>
          BOOKING PLATFORM
        </div>
      </div>

      <div style={{
        width: '100%', maxWidth: 400,
        background: 'rgba(22,8,3,0.82)', backdropFilter: 'blur(20px)',
        border: `1px solid rgba(226,184,74,0.22)`, borderRadius: '6px',
        padding: '2rem', boxShadow: `0 0 60px rgba(0,0,0,0.8), ${GLOW}`,
      }}>
        {done ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontSize: '2rem' }}>✓</div>
            <div style={{ color: '#34d399', fontFamily: 'var(--font-body)', fontSize: '0.95rem', fontWeight: 700 }}>Password updated!</div>
            <div style={{ color: MUTED, fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>Redirecting you to sign in...</div>
          </div>
        ) : !ready ? (
          <div style={{ textAlign: 'center', color: MUTED, fontFamily: 'var(--font-body)', fontSize: '0.88rem', lineHeight: 1.7 }}>
            <div style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>🔗</div>
            Waiting for reset link verification…
            <br />
            <span style={{ fontSize: '0.78rem' }}>Make sure you opened this page from the email link.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ color: '#F5EDDF', fontFamily: 'var(--font-display)', fontSize: '1rem', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
              Set New Password
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.4rem' }}>New Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" required autoFocus style={INPUT} />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.4rem' }}>Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" required style={INPUT} />
            </div>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '3px', padding: '0.6rem', color: '#f87171', fontSize: '0.85rem' }}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{ padding: '0.8rem', background: loading ? 'rgba(226,184,74,0.5)' : GOLD, color: '#1A0800', border: 'none', borderRadius: '3px', fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : GLOW }}>
              {loading ? 'Saving...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
