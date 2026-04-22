import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

/* ── Design tokens ──────────────────────────────────────── */
const BG      = '#080201';
const SURFACE = '#160705';
const CARD    = '#1E0B07';
const GOLD    = '#C8921A';
const GOLD2   = '#D4A030';
const CREAM   = '#F5EDDF';
const CREAM2  = 'rgba(245,237,223,0.72)';
const MUTED   = '#9A7A5C';
const BORDER  = 'rgba(200,146,26,0.16)';
const BORDERL = 'rgba(200,146,26,0.30)';

const TICKER_ITEMS = [
  'BOOK SMARTER','TOUR HARDER','MANAGE YOUR PIPELINE',
  'TRACK EVERY SHOW','BUILD YOUR ROSTER','GROW YOUR CAREER',
  'PITCH VENUES','ADVANCE YOUR SHOWS','MANAGE YOUR BANDS',
];

const FEATURES = [
  {
    icon: '◈',
    title: 'Full Pipeline',
    sub: '9 booking stages',
    desc: 'Every step from first pitch to final advance, tracked and organized in one place.',
  },
  {
    icon: '⟴',
    title: 'Tour Routing',
    sub: 'Plan entire tours',
    desc: 'Build tour pools, route multi-city runs, and track bookings across every date.',
  },
  {
    icon: '♪',
    title: 'Team Portals',
    sub: '3 role tiers',
    desc: 'Separate dashboards for agents, band admins, and individual members.',
  },
];

const TIERS = [
  {
    num: '01',
    title: 'BOOKING AGENT',
    color: GOLD,
    desc: 'The full toolset. Manage your entire roster, run the booking pipeline, and oversee every tour.',
    perks: ['Multi-band roster & dashboard','9-stage booking pipeline','Tour routing & venue database'],
    cta: 'Register as Agent',
    href: '/register?role=agent',
    primary: true,
  },
  {
    num: '02',
    title: 'BAND ADMIN',
    color: '#C4B5FD',
    desc: 'Full visibility into your band\'s schedule, bookings, and tour details.',
    perks: ['Complete show schedule','Advance sheets & venue info','Band member management'],
    cta: 'Register Your Band',
    href: '/register?role=act_admin',
    primary: false,
  },
  {
    num: '03',
    title: 'BAND MEMBER',
    color: '#34D399',
    desc: 'Simple, read-only access to your upcoming shows. Free forever via invite.',
    perks: ['Confirmed shows & set times','Load-in & venue details','Tour calendar'],
    cta: 'Join with Invite',
    href: '/register?role=member',
    primary: false,
  },
];

export default function Landing() {
  const router = useRouter();
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
    <>
      {/* ── Responsive CSS ────────────────────────────────── */}
      <style>{`
        * { box-sizing: border-box; }

        .lp { min-height: 100vh; background: ${BG}; color: ${CREAM}; display: flex; flex-direction: column; font-family: var(--font-body); }

        /* NAV */
        .lp-nav { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; border-bottom: 1px solid ${BORDER}; background: rgba(6,1,0,0.94); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); position: sticky; top: 0; z-index: 50; }
        .lp-nav-logo-title { font-family: var(--font-display); font-size: 1.6rem; letter-spacing: 0.14em; line-height: 1; color: ${GOLD}; }
        .lp-nav-logo-sub { font-family: var(--font-body); font-size: 0.6rem; font-weight: 700; letter-spacing: 0.5em; color: rgba(226,184,74,0.55); text-transform: uppercase; margin-top: 0.1rem; }
        .lp-nav-actions { display: flex; align-items: center; gap: 0.6rem; }
        .lp-nav-signin { font-size: 0.88rem; font-weight: 600; color: ${CREAM2}; text-decoration: none; padding: 0.5rem 0.75rem; }
        .lp-nav-cta { font-size: 0.88rem; font-weight: 700; color: #180700; background: ${GOLD}; padding: 0.55rem 1.15rem; border-radius: 0; text-decoration: none; letter-spacing: 0.04em; white-space: nowrap; }

        /* HERO */
        .lp-hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 3.5rem 1.5rem 3rem; position: relative; overflow: hidden; }
        .lp-hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 130% 80% at 50% -10%, rgba(100,38,8,0.50) 0%, transparent 60%); pointer-events: none; }
        .lp-eyebrow { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; color: ${GOLD}; border: 1px solid ${BORDER}; padding: 0.32rem 0.85rem; border-radius: 0; margin-bottom: 1.75rem; position: relative; }
        .lp-headline { font-family: var(--font-display); font-size: clamp(4rem, 18vw, 9rem); letter-spacing: 0.04em; line-height: 0.88; color: ${CREAM}; margin: 0; position: relative; }
        .lp-headline-gold { font-family: var(--font-display); font-size: clamp(4rem, 18vw, 9rem); letter-spacing: 0.04em; line-height: 0.88; color: ${GOLD}; margin: 0 0 1.75rem; position: relative; }
        .lp-subtext { font-size: 1rem; color: ${CREAM2}; max-width: 380px; line-height: 1.65; margin-bottom: 2rem; position: relative; }
        .lp-cta-primary { display: block; width: 100%; max-width: 380px; text-align: center; font-weight: 700; font-size: 1rem; letter-spacing: 0.08em; text-transform: uppercase; padding: 1rem 2rem; background: ${GOLD}; color: #180700; border-radius: 0; text-decoration: none; margin-bottom: 0.85rem; position: relative; transition: background 0.15s; }
        .lp-cta-primary:hover { background: ${GOLD2}; }
        .lp-cta-secondary-link { font-size: 0.88rem; color: ${MUTED}; text-decoration: none; position: relative; }
        .lp-cta-secondary-link span { color: ${CREAM2}; }
        .lp-trust { display: flex; align-items: center; justify-content: center; gap: 0; margin-top: 2.25rem; position: relative; }
        .lp-trust-item { font-size: 0.76rem; font-weight: 600; color: ${MUTED}; letter-spacing: 0.06em; padding: 0 1rem; text-align: center; }
        .lp-trust-item strong { display: block; font-family: var(--font-display); font-size: 1.6rem; letter-spacing: 0.06em; color: ${GOLD}; line-height: 1; margin-bottom: 0.1rem; }
        .lp-trust-div { width: 1px; height: 2rem; background: ${BORDER}; }

        /* TICKER */
        .lp-ticker-wrap { overflow: hidden; border-top: 1px solid ${BORDER}; border-bottom: 1px solid ${BORDER}; background: ${SURFACE}; padding: 0.65rem 0; }
        .lp-ticker { display: flex; gap: 0; animation: lpTicker 30s linear infinite; width: max-content; }
        .lp-ticker-item { font-family: var(--font-display); font-size: 0.9rem; letter-spacing: 0.2em; color: ${MUTED}; white-space: nowrap; padding: 0 2.5rem; }
        .lp-ticker-item::after { content: '◈'; color: ${GOLD}; margin-left: 2.5rem; }
        @keyframes lpTicker { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        /* SECTION HEADER */
        .lp-section { padding: 4rem 1.5rem; }
        .lp-section-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; color: ${GOLD}; margin-bottom: 0.5rem; }
        .lp-section-title { font-family: var(--font-display); font-size: clamp(2rem, 7vw, 3.5rem); letter-spacing: 0.05em; color: ${CREAM}; margin: 0 0 0.5rem; line-height: 1; }
        .lp-section-sub { font-size: 0.95rem; color: ${CREAM2}; max-width: 480px; line-height: 1.6; }

        /* FEATURE CARDS — horizontal scroll on mobile */
        .lp-features { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; gap: 1rem; padding: 1.75rem 1.5rem 1.5rem; margin: 0 -1.5rem; scrollbar-width: none; }
        .lp-features::-webkit-scrollbar { display: none; }
        .lp-feature-card { flex: 0 0 82%; scroll-snap-align: start; background: ${CARD}; border: 1px solid ${BORDER}; border-top: 2px solid ${GOLD}; border-radius: 0; padding: 1.5rem; }
        .lp-feature-icon { font-size: 1.75rem; color: ${GOLD}; margin-bottom: 1rem; }
        .lp-feature-title { font-family: var(--font-display); font-size: 1.5rem; letter-spacing: 0.05em; color: ${CREAM}; line-height: 1; margin-bottom: 0.2rem; }
        .lp-feature-sub { font-size: 0.76rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${GOLD}; margin-bottom: 0.75rem; }
        .lp-feature-desc { font-size: 0.92rem; color: ${CREAM2}; line-height: 1.6; }

        /* TIER CARDS */
        .lp-tiers { display: flex; flex-direction: column; gap: 1rem; margin-top: 1.75rem; }
        .lp-tier-card { background: ${CARD}; border: 1px solid ${BORDER}; border-radius: 0; padding: 1.5rem; }
        .lp-tier-num { font-family: var(--font-display); font-size: 0.9rem; letter-spacing: 0.18em; margin-bottom: 0.35rem; }
        .lp-tier-title { font-family: var(--font-display); font-size: 2rem; letter-spacing: 0.05em; color: ${CREAM}; line-height: 1; margin-bottom: 0.75rem; }
        .lp-tier-desc { font-size: 0.9rem; color: ${CREAM2}; line-height: 1.6; margin-bottom: 1rem; }
        .lp-tier-perks { list-style: none; margin: 0 0 1.25rem; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
        .lp-tier-perk { display: flex; align-items: center; gap: 0.6rem; font-size: 0.88rem; color: rgba(245,237,223,0.65); }
        .lp-tier-perk-dot { width: 6px; height: 6px; border-radius: 0; flex-shrink: 0; }
        .lp-tier-cta { display: block; text-align: center; font-weight: 700; font-size: 0.9rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 0.8rem 1.5rem; border-radius: 0; text-decoration: none; transition: background 0.15s; }
        .lp-tier-cta-primary { background: ${GOLD}; color: #180700; }
        .lp-tier-cta-primary:hover { background: ${GOLD2}; }
        .lp-tier-cta-outline { background: transparent; border: 1px solid; }

        /* BOTTOM CTA */
        .lp-bottom-cta { margin: 0 1.5rem 4rem; padding: 2.5rem 1.5rem; background: ${SURFACE}; border: 1px solid ${BORDERL}; border-radius: 0; text-align: center; }
        .lp-bottom-cta-title { font-family: var(--font-display); font-size: clamp(1.8rem, 6vw, 3rem); letter-spacing: 0.06em; color: ${CREAM}; margin-bottom: 0.5rem; }
        .lp-bottom-cta-sub { font-size: 0.92rem; color: ${CREAM2}; margin-bottom: 1.75rem; }

        /* FOOTER */
        .lp-footer { border-top: 1px solid ${BORDER}; padding: 1.25rem 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; background: rgba(4,1,0,0.80); }
        .lp-footer-copy { font-size: 0.8rem; color: rgba(226,184,74,0.35); }
        .lp-footer-links { display: flex; gap: 1.25rem; }
        .lp-footer-link { font-size: 0.82rem; font-weight: 600; text-decoration: none; }

        /* DIVIDER */
        .lp-divider { height: 1px; background: linear-gradient(90deg, transparent, ${BORDER}, transparent); margin: 0; }

        /* DESKTOP overrides */
        @media (min-width: 768px) {
          .lp-nav { padding: 1rem 3rem; }
          .lp-nav-logo-title { font-size: 2rem; }
          .lp-hero { padding: 6rem 2rem 5rem; }
          .lp-cta-primary { max-width: 320px; }
          .lp-features { display: grid; grid-template-columns: repeat(3, 1fr); overflow-x: visible; padding: 1.75rem 0 0; margin: 0; }
          .lp-feature-card { flex: unset; }
          .lp-tiers { display: grid; grid-template-columns: repeat(3, 1fr); }
          .lp-section { padding: 5rem 3rem; max-width: 1160px; margin: 0 auto; width: 100%; }
          .lp-bottom-cta { max-width: 800px; margin: 0 auto 5rem; padding: 3.5rem; }
          .lp-footer { padding: 1.5rem 3rem; }
        }

        @media (min-width: 1160px) {
          .lp-hero { padding: 8rem 2rem 6rem; }
        }
      `}</style>

      <div className="lp">

        {/* ── Nav ─────────────────────────────────────────────── */}
        <nav className="lp-nav">
          <div>
            <div className="lp-nav-logo-title">CAMEL RANCH</div>
            <div className="lp-nav-logo-sub">Booking</div>
          </div>
          <div className="lp-nav-actions">
            <Link href="/login" className="lp-nav-signin">Sign In</Link>
            <Link href="/register" className="lp-nav-cta">Get Started</Link>
          </div>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="lp-hero">
          <div className="lp-eyebrow">◈ Professional Booking Management ◈</div>
          <h1 className="lp-headline">BOOK<br />SMARTER.</h1>
          <h1 className="lp-headline-gold">TOUR<br />HARDER.</h1>
          <p className="lp-subtext">
            The complete booking platform for agents, acts, and touring musicians. From first pitch to final advance.
          </p>
          <Link href="/register" className="lp-cta-primary">
            Create Free Account →
          </Link>
          <Link href="/login" className="lp-cta-secondary-link">
            Already have an account? <span>Sign in</span>
          </Link>

          {/* Trust stats */}
          <div className="lp-trust">
            <div className="lp-trust-item"><strong>9</strong>Booking Stages</div>
            <div className="lp-trust-div" />
            <div className="lp-trust-item"><strong>3</strong>Role Portals</div>
            <div className="lp-trust-div" />
            <div className="lp-trust-item"><strong>∞</strong>Bookings</div>
          </div>
        </section>

        {/* ── Ticker ───────────────────────────────────────────── */}
        <div className="lp-ticker-wrap">
          <div className="lp-ticker" aria-hidden="true">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} className="lp-ticker-item">{item}</span>
            ))}
          </div>
        </div>

        {/* ── Features ─────────────────────────────────────────── */}
        <section className="lp-section">
          <div className="lp-section-label">The Platform</div>
          <div className="lp-section-title">Everything you need.</div>
          <p className="lp-section-sub">Built specifically for country, Americana, and touring artists.</p>

          <div className="lp-features">
            {FEATURES.map(f => (
              <div key={f.title} className="lp-feature-card">
                <div className="lp-feature-icon">{f.icon}</div>
                <div className="lp-feature-title">{f.title}</div>
                <div className="lp-feature-sub">{f.sub}</div>
                <p className="lp-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="lp-divider" />

        {/* ── Tiers ────────────────────────────────────────────── */}
        <section className="lp-section">
          <div className="lp-section-label">Choose Your Role</div>
          <div className="lp-section-title">One platform,<br />three portals.</div>
          <p className="lp-section-sub">Each role gets a purpose-built view — no clutter, no confusion.</p>

          <div className="lp-tiers">
            {TIERS.map(t => (
              <div key={t.title} className="lp-tier-card" style={{ borderTop: `3px solid ${t.color}` }}>
                <div className="lp-tier-num" style={{ color: t.color }}>{t.num}</div>
                <div className="lp-tier-title">{t.title}</div>
                <p className="lp-tier-desc">{t.desc}</p>
                <ul className="lp-tier-perks">
                  {t.perks.map(p => (
                    <li key={p} className="lp-tier-perk">
                      <span className="lp-tier-perk-dot" style={{ background: t.color }} />
                      {p}
                    </li>
                  ))}
                </ul>
                <Link
                  href={t.href}
                  className={`lp-tier-cta ${t.primary ? 'lp-tier-cta-primary' : 'lp-tier-cta-outline'}`}
                  style={!t.primary ? { borderColor: t.color, color: t.color } : undefined}
                >
                  {t.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <div className="lp-divider" />

        {/* ── Bottom CTA ───────────────────────────────────────── */}
        <div className="lp-bottom-cta">
          <div className="lp-bottom-cta-title">Ready to book<br />smarter?</div>
          <p className="lp-bottom-cta-sub">Free to start. No credit card required.</p>
          <Link href="/register" className="lp-cta-primary" style={{ maxWidth: 280, margin: '0 auto' }}>
            Create Free Account →
          </Link>
        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <footer className="lp-footer">
          <div className="lp-footer-copy">© {new Date().getFullYear()} Camel Ranch Entertainment</div>
          <div className="lp-footer-links">
            <Link href="/login" className="lp-footer-link" style={{ color: MUTED }}>Sign In</Link>
            <Link href="/register" className="lp-footer-link" style={{ color: GOLD }}>Get Started</Link>
          </div>
        </footer>

      </div>
    </>
  );
}
