import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

const BG    = '#080201';
const GOLD  = '#E2B84A';
const GOLD2 = '#F5C850';
const MUTED = 'rgba(226,184,74,0.55)';
const GLOW  = '0 0 18px rgba(226,184,74,0.42), 0 0 48px rgba(226,184,74,0.14)';

const TIERS = [
  { role: 'agent',     label: 'Booking Agent', icon: '◈', color: '#E2B84A', desc: '$30/mo · 14-day trial' },
  { role: 'act_admin', label: 'Band Admin',    icon: '♪', color: '#a78bfa', desc: '$15/mo · 14-day trial' },
  { role: 'member',    label: 'Band Member',   icon: '◉', color: '#34d399', desc: 'Free via invite'       },
];

export default function Login() {
  const router = useRouter();
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

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
          color: GOLD, textShadow: GLOW, lineHeight: 1,
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

      {/* Login card */}
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'rgba(22,8,3,0.82)', backdropFilter: 'blur(20px)',
        border: `1px solid rgba(226,184,74,0.22)`, borderRadius: '6px',
        padding: '2rem', boxShadow: `0 0 60px rgba(0,0,0,0.8), ${GLOW}`,
      }}>
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
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(226,184,74,0.2)',
                borderRadius: '3px', padding: '0.65rem 0.85rem',
                color: '#F5EDDF', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.72rem',
              fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: MUTED, marginBottom: '0.4rem',
            }}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(226,184,74,0.2)',
                borderRadius: '3px', padding: '0.65rem 0.85rem',
                color: '#F5EDDF', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: '3px', padding: '0.6rem 0.75rem', color: '#f87171', fontSize: '0.85rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              marginTop: '0.25rem', padding: '0.8rem',
              background: loading ? 'rgba(226,184,74,0.5)' : GOLD,
              color: '#1A0800', border: 'none', borderRadius: '3px',
              fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : GLOW, transition: 'all 0.15s',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
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
              background: 'rgba(22,8,3,0.75)',
              border: `1px solid rgba(226,184,74,0.15)`,
              borderRadius: '4px', textDecoration: 'none',
              transition: 'border-color 0.15s, background 0.15s',
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = t.color;
                (e.currentTarget as HTMLAnchorElement).style.background = `${t.color}14`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(226,184,74,0.15)';
                (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(22,8,3,0.75)';
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
