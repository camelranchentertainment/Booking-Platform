import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

const DARK   = '#0C0401';
const DARK2  = '#1A0804';
const GOLD   = '#D4A843';
const GOLD2  = '#F0C860';
const CREAM  = '#F2E8D9';
const MUTED  = '#A08060';
const BORDER = 'rgba(212,168,67,0.18)';

const glow   = '0 0 16px rgba(212,168,67,0.50), 0 0 40px rgba(212,168,67,0.18)';
const glowSm = '0 0 10px rgba(212,168,67,0.40)';

const features = [
  { icon: '◈', text: 'Full booking pipeline from first pitch to signed contract' },
  { icon: '⟴', text: 'Tour routing, venue database & advance management' },
  { icon: '♪', text: 'Separate portals for agents, band admins & members' },
];

const tiers = [
  {
    tier: 'Tier 1',
    title: 'BOOKING AGENT',
    color: GOLD,
    desc: 'Manage your full roster of acts. Run the entire booking pipeline, pitch venues, track tours, manage contacts, and handle the business side of touring.',
    perks: ['Multi-band dashboard','9-stage booking pipeline','Tour routing & management','Venue + contact database','Email outreach','Invite your bands & members'],
    cta: 'Register as Agent',
    href: '/register?role=agent',
    primary: true,
  },
  {
    tier: 'Tier 2',
    title: 'BAND ADMIN',
    color: '#c4b5fd',
    desc: 'The band leader or manager. See your full show schedule, confirmed bookings, tour details, and advance info. Manage your band roster.',
    perks: ['Full show schedule','Booking status & details','Advance sheets','Tour calendar','Band member management','Venue & load-in info'],
    cta: 'Register Your Band',
    href: '/register?role=act_admin',
    primary: false,
  },
  {
    tier: 'Tier 3',
    title: 'BAND MEMBER',
    color: '#34d399',
    desc: 'Individual band member access. See your confirmed shows, venue details, set times, load-in info, and advance sheets.',
    perks: ['Upcoming confirmed shows','Set times & load-in','Venue address & phone','Advance notes','Tour calendar','Free — join via invite'],
    cta: 'Join with Invite Code',
    href: '/register?role=member',
    primary: false,
  },
];

export default function Landing() {
  const router  = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle().then(({ data }) => {
          const role = data?.role || 'agent';
          if (role === 'agent' || role === 'superadmin') router.replace('/dashboard');
          else if (role === 'act_admin') router.replace('/band');
          else router.replace('/member');
        });
      } else {
        setReady(true);
      }
    });
  }, []); // eslint-disable-line

  if (!ready) return null;

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: CREAM, display: 'flex', flexDirection: 'column' }}>

      {/* ── Nav ────────────────────────────────────────────────── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1.1rem 2.5rem',
        borderBottom: `1px solid ${BORDER}`,
        background: 'rgba(10,3,1,0.92)',
        backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', letterSpacing: '0.14em', lineHeight: 1, color: GOLD, textShadow: glow }}>
            CAMEL RANCH
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', fontWeight: 600, letterSpacing: '0.42em', color: `rgba(212,168,67,0.55)`, textTransform: 'uppercase', marginTop: '0.15rem' }}>
            BOOKING
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/login" style={{
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.88rem',
            padding: '0.55rem 1.4rem', border: `1px solid ${BORDER}`,
            borderRadius: '3px', color: CREAM, textDecoration: 'none',
            transition: 'border-color 0.15s, color 0.15s',
          }}>Sign In</Link>
          <Link href="/register" style={{
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.88rem',
            padding: '0.55rem 1.4rem', background: GOLD, border: `1px solid ${GOLD}`,
            borderRadius: '3px', color: '#1A0800', textDecoration: 'none',
            boxShadow: glowSm,
          }}>Get Started</Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center',
        padding: '5rem 1.5rem 4rem',
        background: `radial-gradient(ellipse 100% 70% at 50% 0%, rgba(80,30,8,0.55) 0%, transparent 65%)`,
      }}>

        {/* Eyebrow */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
          fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 600,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: GOLD, border: `1px solid ${BORDER}`,
          padding: '0.35rem 1rem', borderRadius: '2px', marginBottom: '2rem',
        }}>
          ◈ Professional Booking Management ◈
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(3.5rem, 11vw, 8rem)',
          letterSpacing: '0.05em', lineHeight: 0.92,
          color: CREAM, margin: 0,
        }}>
          BOOK SMARTER.
        </h1>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(3.5rem, 11vw, 8rem)',
          letterSpacing: '0.05em', lineHeight: 0.92,
          color: GOLD, textShadow: glow,
          margin: '0 0 2.5rem',
        }}>
          TOUR HARDER.
        </h1>

        {/* Feature bullets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2.75rem', maxWidth: 480, width: '100%' }}>
          {features.map(f => (
            <div key={f.text} style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.85rem',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`,
              borderRadius: '4px', padding: '0.75rem 1rem', textAlign: 'left',
            }}>
              <span style={{ color: GOLD, textShadow: glowSm, fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>{f.icon}</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.92rem', color: 'rgba(242,232,217,0.82)', lineHeight: 1.5 }}>{f.text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/register" style={{
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '1rem',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '0.85rem 2.5rem', background: GOLD,
            border: `1px solid ${GOLD}`, borderRadius: '3px',
            color: '#1A0800', textDecoration: 'none',
            boxShadow: glow,
          }}>
            Create Free Account
          </Link>
          <Link href="/login" style={{
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '1rem',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '0.85rem 2.5rem',
            border: `1px solid rgba(242,232,217,0.2)`,
            borderRadius: '3px', color: 'rgba(242,232,217,0.75)',
            textDecoration: 'none', background: 'transparent',
          }}>
            Sign In
          </Link>
        </div>

        <div style={{
          marginTop: '3.5rem',
          fontFamily: 'var(--font-body)', fontWeight: 600,
          fontSize: '0.8rem', letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'rgba(212,168,67,0.45)',
        }}>
          ↓ &nbsp; Three tiers. One platform. &nbsp; ↓
        </div>
      </section>

      {/* ── Divider ─────────────────────────────────────────────── */}
      <div style={{ height: '1px', background: `linear-gradient(90deg, transparent, ${BORDER}, transparent)` }} />

      {/* ── Tier Cards ─────────────────────────────────────────── */}
      <section style={{ padding: '5rem 2rem', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3rem)', letterSpacing: '0.06em', color: CREAM }}>
            CHOOSE YOUR ROLE
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: MUTED, marginTop: '0.5rem' }}>
            Everyone on the same platform. Different views for different jobs.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1.25rem' }}>
          {tiers.map(t => (
            <div key={t.title} style={{
              background: DARK2, border: `1px solid rgba(255,255,255,0.07)`,
              borderTop: `3px solid ${t.color}`,
              borderRadius: '5px', padding: '2rem',
              display: 'flex', flexDirection: 'column', gap: '0.9rem',
            }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.color }}>
                {t.tier}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', letterSpacing: '0.05em', color: CREAM, lineHeight: 1 }}>
                {t.title}
              </div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'rgba(242,232,217,0.62)', lineHeight: 1.65, margin: 0 }}>
                {t.desc}
              </p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem', margin: 0, padding: 0 }}>
                {t.perks.map(p => (
                  <li key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.83rem', color: 'rgba(242,232,217,0.60)', fontFamily: 'var(--font-body)' }}>
                    <span style={{ color: t.color, fontSize: '0.8rem', flexShrink: 0 }}>◈</span> {p}
                  </li>
                ))}
              </ul>
              <Link href={t.href} style={{
                marginTop: 'auto',
                display: 'block', textAlign: 'center', textDecoration: 'none',
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.88rem',
                letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '0.7rem 1.5rem', borderRadius: '3px',
                background: t.primary ? t.color : 'transparent',
                border: `1px solid ${t.color}`,
                color: t.primary ? '#1A0800' : t.color,
                boxShadow: t.primary ? glowSm : 'none',
              }}>
                {t.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer style={{
        borderTop: `1px solid ${BORDER}`,
        padding: '1.25rem 2.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(8,2,1,0.80)', flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'rgba(212,168,67,0.40)', letterSpacing: '0.08em' }}>
          © {new Date().getFullYear()} Camel Ranch Entertainment
        </div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <Link href="/login" style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: MUTED, textDecoration: 'none' }}>Sign In</Link>
          <Link href="/register" style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: GOLD, textDecoration: 'none' }}>Get Started</Link>
        </div>
      </footer>

    </div>
  );
}
