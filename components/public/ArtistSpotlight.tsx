import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PublicAct } from '../../pages/api/public/acts';

const GOLD   = '#C8921A';
const CREAM  = '#F0D8A2';
const BG     = '#1C0C05';
const SURF   = '#221008';
const BORDER = 'rgba(200,146,26,0.18)';

const ACCENTS = ['#9B6230', '#7A5C2E'];



/* ── Ghost number ─────────────────────────────────────────── */
function GhostNum({ n, color = CREAM }: { n: string; color?: string }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex',
      alignItems: 'flex-end', justifyContent: 'flex-end',
      padding: '1.5rem', pointerEvents: 'none', overflow: 'hidden',
    }}>
      <span style={{
        fontFamily: 'var(--font-display)', fontWeight: 900, color,
        fontSize: '14rem', opacity: 0.045, letterSpacing: '-0.06em',
        lineHeight: 0.8, userSelect: 'none',
      }}>{n}</span>
    </div>
  );
}

/* ── Featured (slot 0) ────────────────────────────────────── */
function FeaturedCard({ act }: { act: PublicAct }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${BORDER}` }}
      className="cr-spot-featured">
      {/* Visual panel */}
      <div style={{
        position: 'relative', minHeight: 300, background: SURF,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', borderRight: `1px solid ${BORDER}`,
        flexShrink: 0,
      }}>
        {act.logo_url && (
          <img src={act.logo_url} alt={act.act_name} style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center top', opacity: 0.85,
          }} />
        )}
        {/* Dark gradient overlay for text legibility */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(10,4,2,0.85) 0%, rgba(10,4,2,0.2) 60%, transparent 100%)',
        }} />
        <GhostNum n="01" color={GOLD} />
        <div style={{ position: 'absolute', top: '1.25rem', left: '1.25rem', zIndex: 2 }}>
          <span style={{
            padding: '0.2rem 0.75rem', background: GOLD, color: BG,
            fontWeight: 700, letterSpacing: '0.35em', fontSize: '0.56rem', textTransform: 'uppercase',
          }}>
            Top Performer
          </span>
        </div>
        {act.genre && (
          <div style={{ position: 'absolute', bottom: '1.25rem', left: '1.25rem', zIndex: 2 }}>
            <p style={{ color: CREAM, letterSpacing: '0.3em', fontSize: '0.62rem', textTransform: 'uppercase', opacity: 0.75, margin: 0 }}>
              {act.genre}
            </p>
          </div>
        )}
        {!act.logo_url && (
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ height: 1, width: 48, background: GOLD }} />
            {act.genre && (
              <p style={{ color: CREAM, letterSpacing: '0.3em', fontSize: '0.62rem', textTransform: 'uppercase', opacity: 0.55, margin: 0 }}>
                {act.genre}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Content panel */}
      <div style={{ background: BG, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '3rem 2.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ height: 1, width: 32, background: GOLD }} />
            <span style={{ color: GOLD, letterSpacing: '0.38em', fontSize: '0.62rem', textTransform: 'uppercase' }}>
              Most Active · This Platform
            </span>
          </div>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, color: CREAM,
            textTransform: 'uppercase', lineHeight: 1, margin: '0 0 1.5rem',
            fontSize: 'clamp(2rem,5vw,3.5rem)', letterSpacing: '-0.02em',
          }}>
            {act.act_name}
          </h3>
          {act.bio && (
            <p style={{ color: CREAM, fontSize: '0.88rem', lineHeight: 1.65, maxWidth: '28rem', marginBottom: '2rem', opacity: 0.72 }}>
              {act.bio}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ color: CREAM, letterSpacing: '0.3em', fontSize: '0.56rem', textTransform: 'uppercase', opacity: 0.55, marginBottom: '0.25rem' }}>
              Confirmed Bookings
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: GOLD, fontSize: '2rem', lineHeight: 1 }}>
              {act.confirmed_count || '—'}
            </div>
          </div>
          <Link href="/register" style={{
            display: 'inline-flex', alignItems: 'center', gap: '1rem',
            color: GOLD, letterSpacing: '0.25em', fontSize: '0.72rem',
            textTransform: 'uppercase', textDecoration: 'none', transition: 'color 0.2s',
          }}
            onMouseEnter={e => (e.currentTarget.style.color = CREAM)}
            onMouseLeave={e => (e.currentTarget.style.color = GOLD)}
          >
            <span>Join Them</span>
            <div style={{ height: 1, width: 32, background: 'currentColor' }} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Supporting card (slots 1–2) ──────────────────────────── */
function SupportingCard({ act, index, last }: { act: PublicAct; index: number; last: boolean }) {
  const accent = ACCENTS[index % ACCENTS.length];
  const num    = String(index + 2).padStart(2, '0');

  return (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column',
      minHeight: 280, background: BG, overflow: 'hidden',
      borderRight: last ? 'none' : `1px solid ${BORDER}`,
    }}>

      <GhostNum n={num} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '2.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ height: 1, width: 24, background: accent }} />
            {act.genre && (
              <span style={{ color: accent, letterSpacing: '0.35em', fontSize: '0.56rem', textTransform: 'uppercase' }}>
                {act.genre}
              </span>
            )}
          </div>
          <h4 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, color: CREAM,
            textTransform: 'uppercase', lineHeight: 1, margin: '0 0 1rem',
            fontSize: 'clamp(1.5rem,3.5vw,2.2rem)', letterSpacing: '-0.01em',
          }}>
            {act.act_name}
          </h4>
          {act.bio && (
            <p style={{ color: CREAM, fontSize: '0.78rem', lineHeight: 1.6, maxWidth: '20rem', opacity: 0.7 }}>
              {act.bio.length > 120 ? act.bio.slice(0, 120) + '…' : act.bio}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: '2rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ color: CREAM, letterSpacing: '0.3em', fontSize: '0.56rem', textTransform: 'uppercase', opacity: 0.55, marginBottom: '0.25rem' }}>
              Confirmed Bookings
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: accent, fontSize: '1.5rem', lineHeight: 1 }}>
              {act.confirmed_count || '—'}
            </div>
          </div>
          <Link href="/register" style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.75rem',
            color: accent, letterSpacing: '0.25em', fontSize: '0.68rem',
            textTransform: 'uppercase', textDecoration: 'none', transition: 'color 0.2s',
          }}
            onMouseEnter={e => (e.currentTarget.style.color = CREAM)}
            onMouseLeave={e => (e.currentTarget.style.color = accent)}
          >
            <span>Get Started</span>
            <div style={{ height: 1, width: 20, background: 'currentColor' }} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Placeholder (no acts in DB yet) ──────────────────────── */
function SpotlightPlaceholder() {
  return (
    <div style={{ position: 'relative', minHeight: 320, background: SURF, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '3rem 2rem' }}>
        <div style={{ height: 1, width: 48, background: GOLD, margin: '0 auto 1.5rem' }} />
        <p style={{ color: 'rgba(240,216,162,0.3)', fontSize: '0.78rem', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
          Be the first success story on this platform
        </p>
        <Link href="/register" style={{
          display: 'inline-block', marginTop: '1.5rem',
          color: GOLD, fontSize: '0.72rem', letterSpacing: '0.25em',
          textTransform: 'uppercase', textDecoration: 'none',
        }}>
          Create Your Free Account →
        </Link>
      </div>
    </div>
  );
}

/* ── ArtistSpotlight ──────────────────────────────────────── */
export default function ArtistSpotlight() {
  const [acts, setActs]       = useState<PublicAct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/public/acts')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setActs(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ height: 200, background: SURF, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'rgba(240,216,162,0.25)', fontSize: '0.72rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          Loading…
        </span>
      </div>
    );
  }

  if (!acts.length) return <SpotlightPlaceholder />;

  const [featured, ...supporting] = acts;

  return (
    <>
      <style>{`
        .cr-spot-featured { flex-direction: column; }
        @media (min-width: 768px) {
          .cr-spot-featured { flex-direction: row !important; }
          .cr-spot-featured > div:first-child { width: 42%; min-height: 0; }
          .cr-spot-featured > div:last-child  { width: 58%; }
          .cr-spot-grid { display: grid; grid-template-columns: repeat(${Math.min(supporting.length, 2)}, 1fr); }
        }
      `}</style>

      <FeaturedCard act={featured} />

      {supporting.length > 0 && (
        <div className="cr-spot-grid" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {supporting.map((act, i) => (
            <SupportingCard key={act.id} act={act} index={i} last={i === supporting.length - 1} />
          ))}
        </div>
      )}

      <div style={{
        padding: '2rem 2.5rem', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <p style={{ color: CREAM, fontSize: '0.78rem', letterSpacing: '0.05em', opacity: 0.55, margin: 0 }}>
          Artists ranked by confirmed bookings tracked on the platform.
        </p>
        <Link href="/register" style={{
          color: GOLD, letterSpacing: '0.25em', fontSize: '0.72rem',
          textTransform: 'uppercase', textDecoration: 'none', transition: 'color 0.2s',
        }}
          onMouseEnter={e => (e.currentTarget.style.color = CREAM)}
          onMouseLeave={e => (e.currentTarget.style.color = GOLD)}
        >
          Join Them →
        </Link>
      </div>
    </>
  );
}
