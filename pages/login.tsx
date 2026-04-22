import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

const BG    = '#0A0502';
const GOLD  = '#C8921A';
const GOLD2 = '#D4A030';
const MUTED = 'rgba(200,146,26,0.55)';


const TIERS = [
  { role: 'agent',     label: 'Booking Agent', icon: '◈', color: '#C8921A', desc: '$30/mo · 14-day trial' },
  { role: 'act_admin', label: 'Band Admin',    icon: '♪', color: '#a78bfa', desc: '$15/mo · 14-day trial' },
  { role: 'member',    label: 'Band Member',   icon: '◉', color: '#34d399', desc: 'Free via invite'       },
];

export default function Login() {
  const router = useRouter();
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent]   = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Login failed'); setLoading(false); return; }

    const { data: profile } = await supabase
      .from('user_profiles').select('role').eq('id', user.id).maybeSingle();

    const role = profile?.role || 'agent';
    if (role === 'superadmin' || role === 'agent') router.replace('/dashboard');
    else if (role === 'act_admin') router.replace('/band');
    else router.replace('/member');
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotLoading(false);
    if (err) { setError(err.message); return; }
    setForgotSent(true);
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

      {/* Back to home */}
      <div style={{ position: 'absolute', top: '1.25rem', left: '1.5rem' }}>
        <Link href="/" style={{
          fontFamily: 'var(--font-body)', fontSize: '0.78rem', letterSpacing: '0.1em',
          textTransform: 'uppercase', color: MUTED, textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: '0.4rem',
        }}>
          ← Home
        </Link>
      </div>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: '2.6rem', letterSpacing: '0.14em',
          color: GOLD, lineHeight: 1,
        }}>
          CAMEL RANCH
        </div>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: '0.7rem', letterSpacing: '0.45em',
          textTransform: 'uppercase', color: MUTED, marginTop: '0.35rem',
        }}>
          BOOKING PLATFORM
        </div>
      </div>

      {/* Login / Forgot password card */}
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'rgba(14,6,3,0.82)', backdropFilter: 'blur(20px)',
        border: `1px solid rgba(200,146,26,0.22)`,
        padding: '2rem',
      }}>

        {/* ── Forgot password view ── */}
        {showForgot ? (
          forgotSent ? (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '2rem' }}>✉️</div>
              <div style={{ color: '#F0D8A2', fontFamily: 'var(--font-body)', fontSize: '0.95rem' }}>
                Check your email
              </div>
              <div style={{ color: MUTED, fontFamily: 'var(--font-body)', fontSize: '0.82rem', lineHeight: 1.6 }}>
                A password reset link was sent to <strong style={{ color: '#F0D8A2' }}>{forgotEmail}</strong>.
                Click the link in the email to set a new password.
              </div>
              <button onClick={() => { setShowForgot(false); setForgotSent(false); setError(''); }}
                style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>
                ← Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgot} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ color: '#F0D8A2', fontFamily: 'var(--font-display)', fontSize: '1rem', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
                Reset Password
              </div>
              <div style={{ color: MUTED, fontFamily: 'var(--font-body)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                Enter your email and we'll send a reset link.
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.4rem' }}>Email</label>
                <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                  placeholder="you@example.com" required autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(200,146,26,0.2)', borderRadius: 0, padding: '0.65rem 0.85rem', color: '#F0D8A2', fontFamily: 'var(--font-body)', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 0, padding: '0.6rem', color: '#f87171', fontSize: '0.85rem' }}>{error}</div>}
              <button type="submit" disabled={forgotLoading}
                style={{ padding: '0.8rem', background: forgotLoading ? 'rgba(200,146,26,0.5)' : GOLD, color: '#1A0800', border: 'none', borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: forgotLoading ? 'not-allowed' : 'pointer' }}>
                {forgotLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button type="button" onClick={() => { setShowForgot(false); setError(''); }}
                style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>
                ← Back to sign in
              </button>
            </form>
          )
        ) : (

        /* ── Sign in view ── */
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{
              display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.72rem',
              fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: MUTED, marginBottom: '0.4rem',
            }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(200,146,26,0.2)',
                borderRadius: 0, padding: '0.65rem 0.85rem',
                color: '#F0D8A2', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
              <label style={{
                fontFamily: 'var(--font-body)', fontSize: '0.72rem',
                fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED,
              }}>Password</label>
              <button type="button" onClick={() => { setShowForgot(true); setForgotEmail(email); setError(''); }}
                style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.72rem', padding: 0 }}>
                Forgot password?
              </button>
            </div>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(200,146,26,0.2)',
                borderRadius: 0, padding: '0.65rem 0.85rem',
                color: '#F0D8A2', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 0, padding: '0.6rem 0.75rem', color: '#f87171', fontSize: '0.85rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              marginTop: '0.25rem', padding: '0.8rem',
              background: loading ? 'rgba(200,146,26,0.5)' : GOLD,
              color: '#1A0800', border: 'none', borderRadius: 0,
              fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        )}
      </div>

      {/* Account type tiles */}
      <div style={{ width: '100%', maxWidth: 400, marginTop: '2rem' }}>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: '0.7rem', letterSpacing: '0.2em',
          textTransform: 'uppercase', color: 'rgba(154,122,92,0.7)', textAlign: 'center',
          marginBottom: '0.85rem',
        }}>
          New here? Create an account
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {TIERS.map(t => (
            <Link key={t.role} href={`/register?role=${t.role}`} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
              padding: '0.9rem 0.5rem',
              background: 'rgba(14,6,3,0.75)',
              border: `1px solid rgba(200,146,26,0.15)`,
              borderRadius: 0, textDecoration: 'none',
              transition: 'border-color 0.15s, background 0.15s',
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = t.color;
                (e.currentTarget as HTMLAnchorElement).style.background = `${t.color}14`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(200,146,26,0.15)';
                (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(14,6,3,0.75)';
              }}
            >
              <span style={{ fontSize: '1.3rem', color: t.color }}>{t.icon}</span>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: t.color,
              }}>{t.label}</span>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: '0.66rem',
                color: 'rgba(154,122,92,0.8)', textAlign: 'center',
              }}>{t.desc}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Divider line at bottom */}
      <div style={{
        marginTop: '2.5rem', fontFamily: 'var(--font-body)', fontSize: '0.66rem',
        letterSpacing: '0.12em', color: 'rgba(154,122,92,0.45)', textTransform: 'uppercase',
      }}>
        Camel Ranch Entertainment · Booking Platform
      </div>
    </div>
  );
}
