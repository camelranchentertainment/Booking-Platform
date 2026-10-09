// components/public/BetaOffer.tsx
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LANDING as T } from './landingTheme';

interface BetaStatus {
  open: boolean;
  spotsRemaining: number;
  cap: number;
}

/**
 * Homepage founding-beta offer. Renders nothing until the live status loads,
 * and nothing at all once every spot is taken — so the section removes itself
 * when the 10th band is approved, with no code change or redeploy.
 */
export default function BetaOffer() {
  const [status, setStatus] = useState<BetaStatus | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/public/beta-status', { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((s: BetaStatus | null) => setStatus(s))
      .catch(() => { /* offline or aborted: keep the section hidden */ });
    return () => ctrl.abort();
  }, []);

  if (!status?.open) return null;

  return (
    <section id="beta" aria-labelledby="beta-heading" style={{ borderTop: `1px solid ${T.border}`, background: T.dark }}>
      <div className="cr-hero-content" style={{ paddingTop: '4.5rem', paddingBottom: '4.5rem' }}>
        <div className="cr-beta-grid" style={{ maxWidth: '68rem', margin: '0 auto' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ height: 1, width: 48, background: T.gold }} />
              <span style={{ color: T.gold, letterSpacing: '0.4em', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                Founding Beta · Limited
              </span>
            </div>
            <h2 id="beta-heading" style={{
              fontFamily: 'var(--font-display)', fontWeight: 900, lineHeight: 1,
              textTransform: 'uppercase', margin: '0 0 1.25rem',
              fontSize: 'clamp(2rem,5vw,3.75rem)', letterSpacing: '-0.01em', color: T.cream,
            }}>
              A Free Year for Our<br />
              <span style={{ color: 'transparent', WebkitTextStroke: `1px ${T.gold}` }}>First {status.cap} Bands.</span>
            </h2>
            <p style={{ color: 'rgba(239,224,189,0.62)', fontSize: '0.95rem', lineHeight: 1.7, margin: '0 0 1rem', maxWidth: '36rem' }}>
              {/* One string: the JSX transform was dropping the space next to the interpolated number. */}
              {`We’re opening Camel Ranch Booking to ${status.cap} founding bands. Each gets a full year of Band Admin access free — the AI booking agent and every feature included. I’ll personally help you get set up and bring in your past shows.`}
            </p>
            <p style={{ color: 'rgba(239,224,189,0.62)', fontSize: '0.95rem', lineHeight: 1.7, margin: 0, maxWidth: '36rem' }}>
              All I ask in return is honest feedback: how it feels to use, what to improve, the quirks and bugs you hit, and the features you&rsquo;d want next.
            </p>
          </div>

          <div style={{ border: `1px solid ${T.gold}`, borderTopWidth: 3, background: 'rgba(224,120,32,0.06)', padding: '2rem 1.75rem' }}>
            <div aria-live="polite" style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '4rem', lineHeight: 1, color: T.cream }}>
                {status.spotsRemaining}
              </span>
              <span style={{ color: 'rgba(239,224,189,0.6)', fontSize: '0.9rem' }}>
                of {status.cap} spots left
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Beta spots filled"
              aria-valuemin={0}
              aria-valuemax={status.cap}
              aria-valuenow={status.cap - status.spotsRemaining}
              style={{ height: 6, background: 'rgba(239,224,189,0.12)', margin: '0.75rem 0 1.75rem' }}
            >
              <div style={{
                height: '100%', background: T.gold,
                width: `${((status.cap - status.spotsRemaining) / status.cap) * 100}%`,
              }} />
            </div>
            <Link href="/beta" style={{
              display: 'block', textAlign: 'center', padding: '0.9rem 1rem',
              background: T.gold, color: T.bg, fontWeight: 700,
              letterSpacing: '0.2em', fontSize: '0.75rem', textTransform: 'uppercase', textDecoration: 'none',
            }}>
              Apply for a Beta Spot
            </Link>
            <p style={{ color: 'rgba(239,224,189,0.42)', fontSize: '0.75rem', lineHeight: 1.6, margin: '1.25rem 0 0' }}>
              One spot per band. Applications are reviewed by hand, usually within 48 hours. When your free year ends, nothing is charged automatically — you choose whether to continue at the regular Band Admin price. It&rsquo;s a beta, so features will change and you may find bugs.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
