import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

const BG   = '#0A0502';
const GOLD = '#C8921A';
const MUTED = 'rgba(200,146,26,0.55)';

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0A0502', border: '1px solid rgba(200,146,26,0.15)',
  borderRadius: 0, padding: '0.65rem 0.85rem',
  color: '#F0D8A2', fontFamily: 'var(--font-body)', fontSize: '0.875rem', outline: 'none',
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
    // Check URL immediately — both hash-based (#type=recovery) and PKCE (?code=)
    const hashParams  = new URLSearchParams(window.location.hash.slice(1));
    const queryParams = new URLSearchParams(window.location.search);
    const isRecoveryUrl = hashParams.get('type') === 'recovery' || queryParams.has('code');

    // Also check if a recovery session is already established before mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && isRecoveryUrl) setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // PASSWORD_RECOVERY = hash-based flow
      // SIGNED_IN on this page with a code param = PKCE recovery flow
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      } else if (event === 'SIGNED_IN' && isRecoveryUrl) {
        setReady(true);
      }
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
    // Sign out after reset so they log in fresh with the new password
    await supabase.auth.signOut();
    setDone(true);
    setTimeout(() => router.replace('/login'), 2500);
  };

  return (
    <div style={{
      minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '2rem 1.25rem',
      backgroundImage: `
        radial-gradient(ellipse 120% 60% at 10% 0%, rgba(80,30,8,0.45) 0%, transparent 55%),
        radial-gradient(ellipse 80% 50% at 90% 100%, rgba(50,15,3,0.35) 0%, transparent 50%)
      `,
    }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem', fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase', color: GOLD, lineHeight: 1 }}>
          CAMEL RANCH
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.35em', textTransform: 'uppercase', color: MUTED, marginTop: '0.35rem' }}>
          BOOKING PLATFORM
        </div>
      </div>

      <div style={{
        width: '100%', maxWidth: 400,
        background: '#120703',
        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'6\' height=\'6\'%3E%3Cpath d=\'M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2\' stroke=\'%23F0D8A2\' stroke-width=\'0.4\'/%3E%3C/svg%3E")',
        backgroundSize: '6px 6px',
        border: '1px solid rgba(200,146,26,0.15)',
        padding: '2rem',
      }}>
        {done ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: '#34d399', fontWeight: 900 }}>✓</div>
            <div style={{ color: '#34d399', fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Password Updated</div>
            <div style={{ color: MUTED, fontFamily: 'var(--font-body)', fontSize: '0.82rem', lineHeight: 1.6 }}>Signing you out — redirecting to login…</div>
          </div>

        ) : !ready ? (
          <div style={{ textAlign: 'center', color: MUTED, fontFamily: 'var(--font-body)', fontSize: '0.875rem', lineHeight: 1.7 }}>
            <div style={{ marginBottom: '0.75rem', fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#F0D8A2' }}>
              Verifying Link
            </div>
            <div style={{ fontSize: '0.78rem' }}>
              If this page stays here, your reset link may have expired.<br />
              <button
                onClick={() => router.replace('/login')}
                style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.78rem', marginTop: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                ← Back to Login
              </button>
            </div>
          </div>

        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#F0D8A2', lineHeight: 1 }}>
                Set New Password
              </div>
              <div style={{ color: MUTED, fontFamily: 'var(--font-body)', fontSize: '0.78rem', marginTop: '0.35rem' }}>
                Choose a new password for your account.
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.4rem' }}>New Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" required autoFocus style={INPUT} />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.4rem' }}>Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" required style={INPUT} />
            </div>
            {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', padding: '0.6rem', color: '#f87171', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{ padding: '0.8rem', background: loading ? 'rgba(200,146,26,0.4)' : GOLD, color: '#0E0603', border: 'none', borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Saving…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
