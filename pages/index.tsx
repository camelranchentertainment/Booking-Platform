import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

export default function Landing() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle().then(({ data }) => {
          const role = data?.role || 'agent';
          if (role === 'agent') router.replace('/dashboard');
          else if (role === 'act_admin') router.replace('/band');
          else router.replace('/member');
        });
      } else {
        setChecking(false);
      }
    });
  }, []);

  if (checking) return null;

  const neon = '#00e5ff';
  const neonGlow = '0 0 12px rgba(0,229,255,0.5), 0 0 30px rgba(0,229,255,0.2)';
  const neonGlowSm = '0 0 8px rgba(0,229,255,0.4)';

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* Subtle grid overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        backgroundImage: `linear-gradient(rgba(0,229,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.03) 1px, transparent 1px)`,
        backgroundSize: '80px 80px',
      }} />

      {/* Content layer */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Nav */}
        <nav style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 3rem',
          borderBottom: '1px solid rgba(0,229,255,0.12)',
          background: 'rgba(7,8,9,0.7)',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: '2rem',
              letterSpacing: '0.14em', lineHeight: 1, color: neon,
              textShadow: neonGlow,
            }}>
              CAMEL RANCH
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
              letterSpacing: '0.45em', color: 'rgba(0,229,255,0.55)',
              textTransform: 'uppercase',
              borderTop: '1px solid rgba(0,229,255,0.2)', paddingTop: '0.2rem', marginTop: '0.25rem',
            }}>
              BOOKING
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Link href="/login" className="btn btn-secondary" style={{ fontSize: '0.82rem' }}>Sign In</Link>
            <Link href="/register" className="btn btn-primary" style={{ fontSize: '0.82rem' }}>Get Started</Link>
          </div>
        </nav>

        {/* Hero */}
        <section style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: '6rem 2rem 4rem',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
            letterSpacing: '0.28em', textTransform: 'uppercase',
            color: neon, marginBottom: '1.25rem',
            opacity: 0.85,
          }}>
            ◈ &nbsp; Professional Booking Management &nbsp; ◈
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(4.5rem, 12vw, 9rem)',
            letterSpacing: '0.06em', lineHeight: 0.9,
            marginBottom: '0.5rem',
            color: '#fff',
          }}>
            BOOK SMARTER.
          </h1>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(4.5rem, 12vw, 9rem)',
            letterSpacing: '0.06em', lineHeight: 0.9,
            marginBottom: '2rem',
            color: neon,
            textShadow: neonGlow,
          }}>
            TOUR HARDER.
          </h1>

          <p style={{
            fontFamily: 'var(--font-body)', fontSize: '1.15rem',
            color: 'rgba(232,238,248,0.65)', maxWidth: 560,
            lineHeight: 1.7, marginBottom: '2.75rem',
          }}>
            A full-stack booking platform for agents, acts, and band members.
            Manage your entire pipeline from first pitch to final advance — all in one place.
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href="/register" className="btn btn-primary btn-lg">
              Create Free Account
            </Link>
            <Link href="/login" className="btn btn-secondary btn-lg">
              Sign In
            </Link>
          </div>

          {/* Scroll indicator */}
          <div style={{
            marginTop: '4rem', fontFamily: 'var(--font-mono)',
            fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'rgba(0,229,255,0.4)',
          }}>
            ↓ &nbsp; three tiers. one platform. &nbsp; ↓
          </div>
        </section>

        {/* Tier cards */}
        <section style={{ padding: '5rem 3rem', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>

            {/* Agent */}
            <div style={{
              background: 'rgba(13,17,23,0.85)', backdropFilter: 'blur(12px)',
              border: `1px solid ${neon}33`,
              borderTop: `2px solid ${neon}`,
              borderRadius: '4px', padding: '2.25rem',
              display: 'flex', flexDirection: 'column', gap: '1rem',
              transition: 'box-shadow 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 30px rgba(0,229,255,0.1)`)}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: neon }}>Tier 1</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', letterSpacing: '0.06em', color: '#fff' }}>BOOKING AGENT</div>
              <p style={{ color: 'rgba(232,238,248,0.6)', fontSize: '0.92rem', lineHeight: 1.7 }}>
                Manage your full roster of acts. Run the booking pipeline, pitch venues, track tours, manage contacts, and handle the entire business side of touring.
              </p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.85rem', color: 'rgba(232,238,248,0.55)' }}>
                {['Multi-band dashboard','9-stage booking pipeline','Tour routing & management','Venue + contact database','Email outreach','Invite your bands & members'].map(f => (
                  <li key={f} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <span style={{ color: neon, textShadow: neonGlowSm }}>◈</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/register?role=agent" className="btn btn-primary" style={{ marginTop: 'auto', justifyContent: 'center' }}>
                Register as Agent
              </Link>
            </div>

            {/* Band Admin */}
            <div style={{
              background: 'rgba(13,17,23,0.85)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(167,139,250,0.2)',
              borderTop: '2px solid #a78bfa',
              borderRadius: '4px', padding: '2.25rem',
              display: 'flex', flexDirection: 'column', gap: '1rem',
              transition: 'box-shadow 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 30px rgba(167,139,250,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#a78bfa' }}>Tier 2</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', letterSpacing: '0.06em', color: '#fff' }}>BAND ADMIN</div>
              <p style={{ color: 'rgba(232,238,248,0.6)', fontSize: '0.92rem', lineHeight: 1.7 }}>
                The band leader or manager. See your full show schedule, confirmed bookings, tour details, and advance info. Manage your band roster.
              </p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.85rem', color: 'rgba(232,238,248,0.55)' }}>
                {['Full show schedule','Booking status & details','Advance sheets','Tour calendar','Band member management','Venue & load-in info'].map(f => (
                  <li key={f} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <span style={{ color: '#a78bfa' }}>◈</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/register?role=act_admin" className="btn btn-secondary" style={{ marginTop: 'auto', justifyContent: 'center', borderColor: '#a78bfa', color: '#a78bfa' }}>
                Register Your Band
              </Link>
            </div>

            {/* Member */}
            <div style={{
              background: 'rgba(13,17,23,0.85)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(52,211,153,0.2)',
              borderTop: '2px solid #34d399',
              borderRadius: '4px', padding: '2.25rem',
              display: 'flex', flexDirection: 'column', gap: '1rem',
              transition: 'box-shadow 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 30px rgba(52,211,153,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#34d399' }}>Tier 3</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', letterSpacing: '0.06em', color: '#fff' }}>BAND MEMBER</div>
              <p style={{ color: 'rgba(232,238,248,0.6)', fontSize: '0.92rem', lineHeight: 1.7 }}>
                Individual band member access. See your confirmed upcoming shows, venue details, set times, load-in info, and advance sheets.
              </p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.85rem', color: 'rgba(232,238,248,0.55)' }}>
                {['Upcoming confirmed shows','Set times & load-in','Venue address & phone','Advance notes','Tour calendar','Read-only access'].map(f => (
                  <li key={f} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <span style={{ color: '#34d399' }}>◈</span> {f}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 'auto', background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '2px', padding: '0.75rem', fontSize: '0.78rem', color: '#34d399', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
                Join via invite from your agent or band admin
              </div>
              <Link href="/register?role=member" className="btn btn-secondary" style={{ justifyContent: 'center', borderColor: '#34d399', color: '#34d399' }}>
                Join with Invite Code
              </Link>
            </div>

          </div>
        </section>

        {/* Footer */}
        <footer style={{
          borderTop: '1px solid rgba(0,229,255,0.08)',
          padding: '1.5rem 3rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(7,8,9,0.6)',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.14em', color: 'rgba(0,229,255,0.3)', textTransform: 'uppercase' }}>
            © {new Date().getFullYear()} Camel Ranch Entertainment
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <Link href="/login" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Sign In</Link>
            <Link href="/register" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: neon, textShadow: neonGlowSm }}>Get Started</Link>
          </div>
        </footer>

      </div>
    </div>
  );
}
