import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../lib/supabase';

interface InviteInfo {
  bandName: string;
  agencyName: string;
  email: string;
  role: string;
}

export default function JoinPage() {
  const router = useRouter();
  const { token } = router.query;

  const [invite,   setInvite]   = useState<InviteInfo | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [joining,  setJoining]  = useState(false);
  const [done,     setDone]     = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/band/invite-info?token=${token}`);
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Invalid or expired invite link.'); setLoading(false); return; }
        setInvite(data);
      } catch { setError('Failed to load invite. Please try again.'); }
      finally { setLoading(false); }
    })();
  }, [token]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setError(''); setJoining(true);
    try {
      const res = await fetch('/api/band/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create account.');
      // Set session
      if (data.accessToken && data.refreshToken) {
        await supabase.auth.setSession({ access_token: data.accessToken, refresh_token: data.refreshToken });
        localStorage.setItem('loggedInUser', JSON.stringify({
          id: data.userId, email: data.email, role: 'band_member',
          token: data.accessToken, refreshToken: data.refreshToken,
        }));
      }
      setDone(true);
      setTimeout(() => router.push('/member'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally { setJoining(false); }
  };

  const inp: React.CSSProperties = { width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(74,133,200,0.25)', borderRadius: 8, color: '#e8f1f8', fontSize: 14, boxSizing: 'border-box', outline: 'none' };

  return (
    <>
      <Head>
        <title>Join Band — Camel Ranch Booking</title>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#030d18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Nunito', sans-serif", padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue', cursive", fontSize: 28, color: '#e8f1f8', margin: '0 auto 12px' }}>C</div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '1.4rem', letterSpacing: '0.07em', color: '#e8f1f8' }}>Camel Ranch Booking</div>
          </div>

          <div style={{ background: 'rgba(9,24,40,0.95)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 16, padding: '32px 28px' }}>

            {loading && <div style={{ textAlign: 'center', color: '#7aa5c4', padding: '2rem 0' }}>Loading invite…</div>}

            {!loading && error && !invite && (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ color: '#f87171', fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{error}</div>
                <button onClick={() => router.push('/')} style={{ color: '#7aa5c4', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>← Back to home</button>
              </div>
            )}

            {!loading && invite && !done && (
              <>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div style={{ color: '#7aa5c4', fontSize: 13, marginBottom: 4 }}>You've been invited to join</div>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '2rem', letterSpacing: '0.06em', color: '#fff' }}>{invite.bandName}</div>
                  {invite.agencyName && <div style={{ color: '#4a7a9b', fontSize: 13, marginTop: 2 }}>via {invite.agencyName}</div>}
                </div>

                {error && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>{error}</div>}

                <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', color: '#7aa5c4', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Email</label>
                    <div style={{ ...inp, color: '#4a7a9b', cursor: 'not-allowed' }}>{invite.email}</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#7aa5c4', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Set Password</label>
                    <input style={inp} type="password" placeholder="Minimum 8 characters" value={password} onChange={e => setPassword(e.target.value)} required />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#7aa5c4', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Confirm Password</label>
                    <input style={inp} type="password" placeholder="Repeat password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
                  </div>
                  <button type="submit" disabled={joining}
                    style={{ padding: '12px', background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4, opacity: joining ? 0.7 : 1 }}>
                    {joining ? 'Creating account…' : 'Join Band & Set Password'}
                  </button>
                </form>
              </>
            )}

            {done && (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ color: '#22c55e', fontSize: 20, marginBottom: 12 }}>✓</div>
                <div style={{ color: '#e8f1f8', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Account created!</div>
                <div style={{ color: '#7aa5c4', fontSize: 13 }}>Taking you to your calendar…</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
