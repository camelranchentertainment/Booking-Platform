// pages/booking-agents.tsx
// Public landing page for independent booking agents. This is the page search
// engines, the homepage nav, the pricing section, login and register all point
// to; its call to action leads to /booker/signup (new agents) or sign-in with
// ?next=/booker (people who already have a Camel Ranch account).
//
// Copy only claims what the Booking Agent workspace does today. Features still
// on the roadmap (linking to band accounts, proposals, agent email) are not
// promised here.

import Head from 'next/head';
import Link from 'next/link';
import BrandLogo from '../components/BrandLogo';
import { AGENT_TIERS } from '../lib/booker/pricing';

// Palette shared with the public homepage (pages/index.tsx).
const GOLD = '#E07820';
const CREAM = '#EFE0BD';
const BG = '#0D1B2A';
const DARK = '#091725';
const BORDER = 'rgba(224,120,32,0.13)';
const MUTED = 'rgba(239,224,189,0.55)';

const SITE = 'https://camelranchbooking.com';
const TITLE = 'Booking Agent Software for Independent Agents | Camel Ranch Booking';
const DESCRIPTION =
  'One workspace for every band you carry: shows and holds, your venue book and contacts, a weekend lineup across all your acts, and the commission each band owes you. Bands do not need an account.';

const FEATURES: Array<{ title: string; body: string }> = [
  { title: 'Every band, one screen', body: 'A tile per act with its next show, holds and booked dates, plus a combined agenda across your whole roster.' },
  { title: 'This weekend at a glance', body: 'Every show you have booked for Friday through Sunday, across all your bands, with a lineup post you can copy straight to Facebook.' },
  { title: 'Your venue book', body: 'Save the dancehalls, saloons, wineries and clubs you work, once, and book any of your bands into them.' },
  { title: 'Private contacts', body: 'Talent buyers and venue managers stay yours. Bands you book never see your contacts or your private notes.' },
  { title: 'Commission tracking', body: 'Set a rate per band, override it per show, and log payments by Cash App, Venmo, check or cash. See what each band owes you, by year.' },
  { title: 'Nothing slips', body: 'Follow-ups that are due, holds that passed without an answer, and shows that still need settling all show up on your home screen.' },
];

const STEPS: Array<{ title: string; body: string }> = [
  { title: 'Create your workspace', body: 'Sign up with your agency name. Already use Camel Ranch for your own band? Sign in and add a Booking Agent workspace to the same login.' },
  { title: 'Add the bands you carry', body: 'Any act, any genre. Your bands do not need their own Camel Ranch account to be on your roster.' },
  { title: 'Book, follow up, get paid', body: 'Put holds on the calendar, confirm the shows, mark them played, and track the commission that comes back.' },
];

const FAQ: Array<{ q: string; a: string }> = [
  { q: 'Do my bands need a Camel Ranch account?', a: 'No. You can add any band to your roster and track its shows yourself.' },
  { q: 'Can bands see my contacts?', a: 'No. Your venue contacts and private notes are visible only to you.' },
  { q: 'How is commission worked out?', a: 'You set a percentage for each band (and can override it on a single show). Commission is earned once a show is marked played, on the amount the band actually received if you enter it, otherwise on the agreed fee.' },
  { q: 'Is there a limit on how many bands I can carry?', a: 'No limit. Pricing steps up with the size of your roster, and agencies with 50 or more bands get custom pricing.' },
  { q: 'I am in the beta. How do I use my code?', a: 'Enter the signup code from Camel Ranch on the sign-up form and your free beta period is applied automatically.' },
];

function priceLabel(monthlyUsd: number | null): string {
  return monthlyUsd === null ? "Let's talk" : `$${monthlyUsd}`;
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Camel Ranch Booking — Booking Agent workspace',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: `${SITE}/booking-agents`,
  description: DESCRIPTION,
  offers: AGENT_TIERS.filter(t => t.monthlyUsd !== null).map(t => ({
    '@type': 'Offer',
    name: `${t.label} (${t.maxBands === null ? `${t.minBands}+` : `up to ${t.maxBands}`} bands)`,
    price: String(t.monthlyUsd),
    priceCurrency: 'USD',
  })),
};

const eyebrow: React.CSSProperties = { color: GOLD, letterSpacing: '0.4em', fontSize: '0.68rem', textTransform: 'uppercase' };
const h2: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  lineHeight: 1,
  textTransform: 'uppercase',
  margin: '0 0 0.75rem',
  fontSize: 'clamp(2rem,5vw,3.6rem)',
  letterSpacing: '-0.01em',
  color: CREAM,
};
const primaryBtn: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.9rem 2.2rem',
  background: GOLD,
  color: BG,
  fontWeight: 700,
  letterSpacing: '0.22em',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  textDecoration: 'none',
};
const secondaryBtn: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.9rem 2.2rem',
  color: CREAM,
  letterSpacing: '0.22em',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  textDecoration: 'none',
  border: '1px solid rgba(239,224,189,0.3)',
};

function Eyebrow({ children }: { children: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
      <div aria-hidden="true" style={{ height: 1, width: 48, background: GOLD }} />
      <span style={eyebrow}>{children}</span>
    </div>
  );
}

export default function BookingAgentsPage() {
  return (
    <>
      <Head>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} key="description" />
        <link rel="canonical" href={`${SITE}/booking-agents`} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${SITE}/booking-agents`} />
        <meta property="og:title" content="Booking Agent workspace · Camel Ranch Booking" />
        <meta property="og:description" content={DESCRIPTION} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </Head>
      <style>{`
        .ba-wrap { max-width: 68rem; margin: 0 auto; padding: 0 1.25rem; }
        .ba-grid-3 { display: grid; grid-template-columns: 1fr; gap: 1rem; }
        .ba-nav-links { display: none; }
        .ba-cta:focus-visible, .ba-link:focus-visible { outline: 2px solid ${CREAM}; outline-offset: 3px; }
        .ba-cta-primary:hover { background: ${CREAM} !important; }
        .ba-cta-secondary:hover { border-color: ${GOLD} !important; color: ${GOLD} !important; }
        @media (min-width: 768px) {
          .ba-wrap { padding: 0 2rem; }
          .ba-grid-3 { grid-template-columns: repeat(3, 1fr); }
          .ba-nav-links { display: flex; }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'var(--font-body)' }}>
        <a href="#main" className="ba-link" style={{ position: 'absolute', left: -9999 }} onFocus={e => (e.currentTarget.style.left = '1rem')} onBlur={e => (e.currentTarget.style.left = '-9999px')}>
          Skip to content
        </a>

        <header style={{ borderBottom: '1px solid rgba(224,120,32,0.18)', background: 'rgba(13,27,42,0.95)' }}>
          <nav className="ba-wrap" aria-label="Main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', gap: '1rem' }}>
            <Link href="/" aria-label="Camel Ranch Booking home">
              <BrandLogo variant="banner" height={44} />
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div className="ba-nav-links" style={{ gap: '1.5rem' }}>
                <a className="ba-link" href="#features" style={{ color: MUTED, fontSize: '0.72rem', letterSpacing: '0.22em', textTransform: 'uppercase', textDecoration: 'none' }}>
                  Features
                </a>
                <a className="ba-link" href="#pricing" style={{ color: MUTED, fontSize: '0.72rem', letterSpacing: '0.22em', textTransform: 'uppercase', textDecoration: 'none' }}>
                  Pricing
                </a>
              </div>
              <Link className="ba-link" href="/login?next=/booker" style={{ color: MUTED, fontSize: '0.72rem', letterSpacing: '0.22em', textTransform: 'uppercase', textDecoration: 'none' }}>
                Sign in
              </Link>
            </div>
          </nav>
        </header>

        <main id="main">
          {/* Hero */}
          <section style={{ background: DARK, borderBottom: BORDER }}>
            <div className="ba-wrap" style={{ paddingTop: '5rem', paddingBottom: '5rem', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Eyebrow>For booking agents</Eyebrow>
              </div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, lineHeight: 0.92, textTransform: 'uppercase', margin: '0 0 1.5rem', fontSize: 'clamp(2.6rem,7vw,5.2rem)', letterSpacing: '-0.02em' }}>
                Every band you carry.
                <br />
                <span style={{ color: GOLD }}>One workspace.</span>
              </h1>
              <p style={{ color: MUTED, fontSize: '1.05rem', lineHeight: 1.7, maxWidth: '38rem', margin: '0 auto 2.25rem' }}>
                Shows and holds for your whole roster, your venue book and contacts, this weekend’s lineup across every act, and the commission each band owes you. Built for independent agents, not spreadsheets.
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/booker/signup" className="ba-cta ba-cta-primary" style={primaryBtn}>
                  Create agent workspace
                </Link>
                <Link href="/login?next=/booker" className="ba-cta ba-cta-secondary" style={secondaryBtn}>
                  I already have an account
                </Link>
              </div>
              <p style={{ marginTop: '1.5rem', color: 'rgba(239,224,189,0.35)', fontSize: '0.78rem', letterSpacing: '0.05em' }}>
                Free trial · Beta testers: enter your code at sign-up · Your bands don’t need an account
              </p>
            </div>
          </section>

          {/* Features */}
          <section id="features" aria-labelledby="features-h" style={{ borderBottom: BORDER }}>
            <div className="ba-wrap" style={{ paddingTop: '4.5rem', paddingBottom: '4.5rem' }}>
              <Eyebrow>What you get</Eyebrow>
              <h2 id="features-h" style={h2}>
                Run your roster,
                <br />
                not your inbox.
              </h2>
              <div className="ba-grid-3" style={{ marginTop: '2rem' }}>
                {FEATURES.map(f => (
                  <article key={f.title} style={{ border: '1px solid rgba(224,120,32,0.18)', borderTop: `3px solid ${GOLD}`, background: DARK, padding: '1.4rem' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', letterSpacing: '0.03em', margin: '0 0 0.5rem', color: CREAM }}>{f.title}</h3>
                    <p style={{ color: MUTED, fontSize: '0.92rem', lineHeight: 1.65, margin: 0 }}>{f.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* How it works */}
          <section aria-labelledby="how-h" style={{ background: DARK, borderBottom: BORDER }}>
            <div className="ba-wrap" style={{ paddingTop: '4.5rem', paddingBottom: '4.5rem' }}>
              <Eyebrow>How it works</Eyebrow>
              <h2 id="how-h" style={h2}>
                Up and booking
                <br />
                in minutes.
              </h2>
              <ol className="ba-grid-3" style={{ listStyle: 'none', padding: 0, margin: '2rem 0 0' }}>
                {STEPS.map((s, i) => (
                  <li key={s.title} style={{ padding: '1.25rem 0', borderTop: '1px solid rgba(224,120,32,0.25)' }}>
                    <div aria-hidden="true" style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem', color: GOLD, lineHeight: 1 }}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', letterSpacing: '0.03em', margin: '0.6rem 0 0.35rem', color: CREAM }}>{s.title}</h3>
                    <p style={{ color: MUTED, fontSize: '0.92rem', lineHeight: 1.65, margin: 0 }}>{s.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Pricing */}
          <section id="pricing" aria-labelledby="pricing-h" style={{ borderBottom: BORDER }}>
            <div className="ba-wrap" style={{ paddingTop: '4.5rem', paddingBottom: '4.5rem' }}>
              <Eyebrow>Pricing</Eyebrow>
              <h2 id="pricing-h" style={h2}>Priced by your roster.</h2>
              <p style={{ color: MUTED, fontSize: '0.95rem', lineHeight: 1.65, maxWidth: '36rem', margin: 0 }}>No cap on bands. Your plan follows the number of active bands you carry.</p>
              <div className="ba-grid-3" style={{ marginTop: '2rem' }}>
                {AGENT_TIERS.map((t, i) => (
                  <div key={t.key} style={{ border: `1px solid ${i === 0 ? GOLD : 'rgba(224,120,32,0.18)'}`, borderTop: `3px solid ${GOLD}`, background: i === 0 ? 'rgba(224,120,32,0.05)' : DARK, padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ ...eyebrow, letterSpacing: '0.22em', marginBottom: '0.5rem' }}>{t.label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginBottom: '0.4rem' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.8rem', lineHeight: 1 }}>{priceLabel(t.monthlyUsd)}</span>
                      {t.monthlyUsd !== null && <span style={{ color: 'rgba(239,224,189,0.45)', fontSize: '0.8rem' }}>/month</span>}
                    </div>
                    <p style={{ color: MUTED, fontSize: '0.9rem', margin: '0 0 1.25rem' }}>
                      {t.maxBands === null ? `${t.minBands} or more bands` : t.minBands === 0 ? `Up to ${t.maxBands} bands` : `${t.minBands}–${t.maxBands} bands`}
                    </p>
                    <div style={{ marginTop: 'auto' }}>
                      {t.monthlyUsd === null ? (
                        <a className="ba-cta ba-cta-secondary" href="mailto:booking@camelranchbooking.com?subject=Booking%20Agent%20pricing" style={{ ...secondaryBtn, padding: '0.7rem 1.2rem', fontSize: '0.7rem' }}>
                          Contact us
                        </a>
                      ) : (
                        <Link href="/booker/signup" className="ba-cta ba-cta-secondary" style={{ ...secondaryBtn, padding: '0.7rem 1.2rem', fontSize: '0.7rem' }}>
                          Start free trial
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section aria-labelledby="faq-h" style={{ background: DARK, borderBottom: BORDER }}>
            <div className="ba-wrap" style={{ paddingTop: '4.5rem', paddingBottom: '4.5rem', maxWidth: '52rem' }}>
              <Eyebrow>Questions</Eyebrow>
              <h2 id="faq-h" style={h2}>Good to know.</h2>
              <div style={{ marginTop: '1.5rem' }}>
                {FAQ.map(item => (
                  <details key={item.q} style={{ borderTop: '1px solid rgba(224,120,32,0.2)', padding: '1rem 0' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: '1rem', color: CREAM, minHeight: 44, display: 'flex', alignItems: 'center' }}>{item.q}</summary>
                    <p style={{ color: MUTED, fontSize: '0.95rem', lineHeight: 1.7, margin: '0.5rem 0 0' }}>{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          {/* Closing CTA */}
          <section aria-labelledby="cta-h">
            <div className="ba-wrap" style={{ paddingTop: '4.5rem', paddingBottom: '4.5rem', textAlign: 'center' }}>
              <h2 id="cta-h" style={{ ...h2, fontSize: 'clamp(1.8rem,4vw,3rem)' }}>Bring your roster in.</h2>
              <p style={{ color: MUTED, margin: '0 auto 2rem', maxWidth: '30rem', lineHeight: 1.65 }}>Set up your agency, add your first band, and see your weekend in one place.</p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/booker/signup" className="ba-cta ba-cta-primary" style={primaryBtn}>
                  Create agent workspace
                </Link>
                <Link href="/" className="ba-cta ba-cta-secondary" style={secondaryBtn}>
                  I’m in a band
                </Link>
              </div>
            </div>
          </section>
        </main>

        <footer style={{ background: '#060F1A', borderTop: BORDER, padding: '2rem 0' }}>
          <div className="ba-wrap" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', color: 'rgba(239,224,189,0.35)', fontSize: '0.72rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            <span>© {new Date().getFullYear()} Camel Ranch Entertainment</span>
            <a className="ba-link" href="mailto:booking@camelranchbooking.com" style={{ color: 'rgba(239,224,189,0.5)', textDecoration: 'none' }}>
              booking@camelranchbooking.com
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}
