import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import ArtistSpotlight from '../components/public/ArtistSpotlight';

const GOLD   = '#C8921A';
const CREAM  = '#F0D8A2';
const BG     = '#0E0603';
const DARK   = '#0A0502';
const BORDER = 'rgba(200,146,26,0.13)';

const NAV_LINKS = ['Features', 'How It Works', 'Contact'];

/* ── Hatch SVG ────────────────────────────────────────────── */
function HatchBg({ id, rotate = 45, opacity = 0.04 }: { id: string; rotate?: number; opacity?: number }) {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity }}>
      <defs>
        <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform={`rotate(${rotate})`}>
          <line x1="0" y1="0" x2="0" y2="8" stroke={CREAM} strokeWidth="0.8" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/* ── Wordmark ─────────────────────────────────────────────── */
function Wordmark() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 900,
        color: CREAM, letterSpacing: '0.28em', textTransform: 'uppercase',
        lineHeight: 1, fontSize: '0.88rem',
      }}>
        Camel Ranch
      </div>
      <div style={{
        color: GOLD, letterSpacing: '0.5em', textTransform: 'uppercase',
        fontSize: '0.56rem', marginTop: '0.1rem',
      }}>
        Booking
      </div>
    </div>
  );
}

/* ── Nav ──────────────────────────────────────────────────── */
function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '1.25rem 2rem',
      background: 'rgba(14,6,3,0.95)', backdropFilter: 'blur(8px)',
      borderBottom: `1px solid rgba(200,146,26,0.18)`,
    }}>
      <a href="#" style={{ textDecoration: 'none' }}><Wordmark /></a>

      {/* Desktop links */}
      <div className="cr-nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
        {NAV_LINKS.map(l => (
          <a key={l} href={`#${l.toLowerCase()}`} style={{
            color: 'rgba(240,216,162,0.55)', fontSize: '0.72rem',
            letterSpacing: '0.22em', textTransform: 'uppercase',
            textDecoration: 'none', transition: 'color 0.2s',
          }}
            onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,216,162,0.55)')}
          >
            {l}
          </a>
        ))}
        <Link href="/register" style={{
          color: GOLD, fontSize: '0.72rem', letterSpacing: '0.22em',
          textTransform: 'uppercase', textDecoration: 'none',
          padding: '0.45rem 1rem', border: `1px solid ${GOLD}`,
          transition: 'background 0.2s, color 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = GOLD; e.currentTarget.style.color = BG; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = GOLD; }}
        >
          Get Started
        </Link>
        <Link href="/login" style={{
          color: 'rgba(240,216,162,0.35)', fontSize: '0.68rem',
          letterSpacing: '0.2em', textTransform: 'uppercase', textDecoration: 'none',
        }}>
          Login
        </Link>
      </div>

      {/* Hamburger */}
      <button
        className="cr-hamburger"
        onClick={() => setOpen(v => !v)}
        style={{ display: 'none', background: 'none', border: 'none', color: CREAM, cursor: 'pointer', padding: 0 }}
        aria-label="Toggle menu"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          {open
            ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
            : <><line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" /></>
          }
        </svg>
      </button>

      {/* Mobile dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: BG, padding: '1.5rem 2rem',
          display: 'flex', flexDirection: 'column', gap: '1.5rem',
          borderTop: `1px solid rgba(200,146,26,0.15)`,
        }}>
          {NAV_LINKS.map(l => (
            <a key={l} href={`#${l.toLowerCase()}`} onClick={() => setOpen(false)} style={{
              color: 'rgba(240,216,162,0.55)', fontSize: '0.72rem',
              letterSpacing: '0.22em', textTransform: 'uppercase', textDecoration: 'none',
            }}>
              {l}
            </a>
          ))}
          <Link href="/login" onClick={() => setOpen(false)} style={{
            color: 'rgba(240,216,162,0.35)', fontSize: '0.68rem',
            letterSpacing: '0.2em', textTransform: 'uppercase', textDecoration: 'none',
          }}>
            Platform Login
          </Link>
        </div>
      )}
    </nav>
  );
}

/* ── Hero ─────────────────────────────────────────────────── */
function Hero() {
  return (
    <section style={{
      position: 'relative', minHeight: '100vh',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      background: BG, overflow: 'hidden',
    }}>
      <HatchBg id="hero-hatch" rotate={45} opacity={0.04} />

      {/* Gold rule under nav */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
        opacity: 0.3, top: '5.5rem',
      }} />

      {/* Ghost "CR" */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'flex-end',
        paddingRight: '4rem', pointerEvents: 'none', overflow: 'hidden', opacity: 0.025,
      }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 900, color: CREAM,
          textTransform: 'uppercase', fontSize: '22vw', lineHeight: 0.85,
          letterSpacing: '-0.04em', whiteSpace: 'nowrap', userSelect: 'none',
        }}>
          CR
        </span>
      </div>

      {/* Content */}
      <div className="cr-hero-content" style={{ position: 'relative', zIndex: 10 }}>
        <div style={{ maxWidth: '68rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ height: 1, width: 48, background: GOLD }} />
            <span style={{
              color: GOLD, letterSpacing: '0.4em', fontSize: '0.68rem', textTransform: 'uppercase',
            }}>
              Built for Working Musicians
            </span>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, lineHeight: 0.88,
            color: CREAM, textTransform: 'uppercase', margin: '0 0 0.25rem',
            fontSize: 'clamp(3rem,11vw,8.5rem)', letterSpacing: '-0.02em',
          }}>
            Your Shows.
          </h1>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, lineHeight: 0.88,
            color: 'transparent', WebkitTextStroke: `1px ${GOLD}`,
            textTransform: 'uppercase', margin: '0 0 0.25rem',
            fontSize: 'clamp(3rem,11vw,8.5rem)', letterSpacing: '-0.02em',
          }}>
            Your Band.
          </h1>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, lineHeight: 0.88,
            color: CREAM, textTransform: 'uppercase', margin: '0 0 2.5rem',
            fontSize: 'clamp(3rem,11vw,8.5rem)', letterSpacing: '-0.02em',
          }}>
            Organized.
          </h1>

          <div className="cr-hero-bottom">
            <p style={{ maxWidth: '26rem', color: 'rgba(240,216,162,0.42)', fontSize: '0.88rem', lineHeight: 1.65 }}>
              Stop losing gigs to missed follow-ups and disorganized schedules. One platform to track every booking, keep your whole band in the loop, and take your career further.
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <Link href="/register" style={{
                padding: '0.75rem 2rem', background: GOLD, color: BG,
                fontWeight: 700, letterSpacing: '0.22em', fontSize: '0.72rem',
                textTransform: 'uppercase', textDecoration: 'none',
                transition: 'background 0.2s',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = CREAM)}
                onMouseLeave={e => (e.currentTarget.style.background = GOLD)}
              >
                Get Started Free
              </Link>
              <Link href="/login" style={{
                padding: '0.75rem 2rem', color: CREAM,
                letterSpacing: '0.22em', fontSize: '0.72rem',
                textTransform: 'uppercase', textDecoration: 'none',
                border: `1px solid rgba(240,216,162,0.22)`,
                transition: 'border-color 0.2s, color 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(240,216,162,0.22)'; e.currentTarget.style.color = CREAM; }}
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gold rule */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, opacity: 0.22,
      }} />

      {/* Scroll indicator */}
      <div style={{
        position: 'absolute', bottom: '2rem', right: '2rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
      }}>
        <div style={{
          height: 48, width: 1,
          background: `linear-gradient(to bottom, ${GOLD}, transparent)`, opacity: 0.45,
        }} />
        <span style={{
          color: CREAM, letterSpacing: '0.3em', fontSize: '0.56rem', textTransform: 'uppercase',
          writingMode: 'vertical-rl', opacity: 0.28,
        }}>
          Scroll
        </span>
      </div>
    </section>
  );
}

/* ── Features ─────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: '◈',
    title: 'Track Every Booking',
    sub: '9 pipeline stages',
    desc: 'From first pitch to final advance — every booking moves through a clear pipeline so nothing falls through the cracks.',
  },
  {
    icon: '♪',
    title: 'Keep Your Band in Sync',
    sub: 'Role-based portals',
    desc: 'Every member sees their load-in time, set time, and venue details. No more group texts, no more "what time are we there?"',
  },
  {
    icon: '⟴',
    title: 'Build Your Tours',
    sub: 'Multi-city routing',
    desc: 'Plan entire tour runs, route dates across cities, and see your full schedule in one place — confirmed and in progress.',
  },
  {
    icon: '✉',
    title: 'Advance Like a Pro',
    sub: 'Show-day ready',
    desc: 'Venue contacts, deal notes, hospitality, and stage details all stored and ready when show day arrives.',
  },
];

function Features() {
  return (
    <section id="features" style={{ borderTop: BORDER, background: DARK }}>
      <div className="cr-hero-content" style={{ paddingBottom: '1rem', paddingTop: '5rem' }}>
        <div style={{ maxWidth: '68rem', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ height: 1, width: 48, background: GOLD }} />
            <span style={{ color: GOLD, letterSpacing: '0.4em', fontSize: '0.68rem', textTransform: 'uppercase' }}>
              The Platform
            </span>
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            lineHeight: 1, textTransform: 'uppercase', margin: '0 0 0.75rem',
            fontSize: 'clamp(2rem,5vw,4rem)', letterSpacing: '-0.01em', color: CREAM,
          }}>
            Everything You Need<br />To Run Your Career.
          </h2>
          <p style={{ color: 'rgba(240,216,162,0.38)', fontSize: '0.88rem', lineHeight: 1.65, maxWidth: '32rem', margin: 0 }}>
            Built for working musicians — not spreadsheets, not email chains, not sticky notes.
          </p>
        </div>
      </div>

      <div className="cr-hero-content" style={{ paddingTop: '2.5rem', paddingBottom: '5rem' }}>
        <div className="cr-features-grid" style={{ maxWidth: '68rem', margin: '0 auto' }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              borderTop: `2px solid ${GOLD}`,
              border: `1px solid rgba(200,146,26,0.15)`,
              borderTopWidth: 2,
              borderTopColor: GOLD,
              padding: '2rem',
              background: BG,
            }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: '1.75rem',
                color: GOLD, marginBottom: '1rem', lineHeight: 1,
              }}>
                {f.icon}
              </div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: '1.4rem',
                letterSpacing: '0.03em', color: CREAM, lineHeight: 1, marginBottom: '0.3rem',
              }}>
                {f.title}
              </div>
              <div style={{
                fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: GOLD, marginBottom: '0.85rem',
              }}>
                {f.sub}
              </div>
              <p style={{ fontSize: '0.88rem', color: 'rgba(240,216,162,0.55)', lineHeight: 1.65, margin: 0 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Sign-Up CTA ──────────────────────────────────────────── */
function SignUpCTA() {
  return (
    <section style={{
      position: 'relative', background: DARK,
      borderTop: BORDER, overflow: 'hidden',
    }}>
      <HatchBg id="cta-hatch" rotate={32} opacity={0.035} />

      <div className="cr-hero-content" style={{ paddingTop: '6rem', paddingBottom: '6rem' }}>
        <div style={{ maxWidth: '52rem', margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ height: 1, width: 48, background: GOLD }} />
            <span style={{ color: GOLD, letterSpacing: '0.4em', fontSize: '0.68rem', textTransform: 'uppercase' }}>
              Get Started
            </span>
            <div style={{ height: 1, width: 48, background: GOLD }} />
          </div>

          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900, lineHeight: 0.9,
            textTransform: 'uppercase', margin: '0 0 1.5rem',
            fontSize: 'clamp(2.5rem,7vw,5.5rem)', letterSpacing: '-0.02em',
          }}>
            <span style={{ color: CREAM }}>Stop Losing Gigs<br />To </span>
            <span style={{ color: 'transparent', WebkitTextStroke: `1px ${GOLD}` }}>Disorganization.</span>
          </h2>

          <p style={{
            color: 'rgba(240,216,162,0.45)', fontSize: '1rem',
            lineHeight: 1.7, maxWidth: '34rem', margin: '0 auto 2.5rem',
          }}>
            Free to start. Sign up as a band admin to manage your bookings, or join your band with an invite from your admin.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register" style={{
              display: 'inline-block', padding: '0.9rem 2.5rem',
              background: GOLD, color: BG, fontWeight: 700,
              letterSpacing: '0.22em', fontSize: '0.78rem', textTransform: 'uppercase',
              textDecoration: 'none', transition: 'background 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = CREAM)}
              onMouseLeave={e => (e.currentTarget.style.background = GOLD)}
            >
              Create Free Account
            </Link>
            <Link href="/login" style={{
              display: 'inline-block', padding: '0.9rem 2.5rem',
              color: CREAM, letterSpacing: '0.22em', fontSize: '0.78rem',
              textTransform: 'uppercase', textDecoration: 'none',
              border: `1px solid rgba(240,216,162,0.22)`, transition: 'border-color 0.2s, color 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(240,216,162,0.22)'; e.currentTarget.style.color = CREAM; }}
            >
              Already Have an Account
            </Link>
          </div>

          <p style={{
            marginTop: '2rem', color: 'rgba(240,216,162,0.22)',
            fontSize: '0.72rem', letterSpacing: '0.1em',
          }}>
            No credit card required · Free forever for band members
          </p>

        </div>
      </div>
    </section>
  );
}

/* ── Booking Form ─────────────────────────────────────────── */
type FormState = { name: string; email: string; venue: string; date: string; artist: string; notes: string };

function BookingForm() {
  const [form, setForm]     = useState<FormState>({ name: '', email: '', venue: '', date: '', artist: '', notes: '' });
  const [sent, setSent]     = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr]       = useState('');

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setSending(true);
    try {
      const res = await fetch('/api/public/booking-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Failed to send. Please try again.'); return; }
      setSent(true);
    } catch {
      setErr('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'transparent', color: CREAM,
    fontSize: '0.88rem', padding: '0.75rem 0',
    border: 'none', borderBottom: `1px solid rgba(240,216,162,0.14)`,
    outline: 'none', fontFamily: 'var(--font-body)',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', color: 'rgba(240,216,162,0.28)',
    fontSize: '0.68rem', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '0.5rem',
  };

  const focusGold  = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    (e.currentTarget.style.borderBottomColor = GOLD);
  const blurNormal = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    (e.currentTarget.style.borderBottomColor = 'rgba(240,216,162,0.14)');

  const INFO_ROWS = [
    ['Response',    'Within 48 hours'],
    ['Availability','Year-round booking'],
    ['Formats',     'Full band · Duo/Trio · Acoustic'],
  ];

  return (
    <section id="booking" style={{
      background: DARK, padding: '7rem 2rem',
      borderTop: BORDER,
    }}>
      <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
        <div className="cr-booking-grid">

          {/* Left — copy */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ height: 1, width: 48, background: GOLD }} />
              <span style={{ color: GOLD, letterSpacing: '0.4em', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                Book an Act
              </span>
            </div>

            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 900,
              lineHeight: 0.9, textTransform: 'uppercase', margin: '0 0 2rem',
              fontSize: 'clamp(2.5rem,6vw,5rem)', letterSpacing: '-0.01em',
            }}>
              <span style={{ color: CREAM }}>Let&rsquo;s Talk<br /></span>
              <span style={{ color: 'transparent', WebkitTextStroke: `1px ${GOLD}` }}>Business</span>
            </h2>

            <p style={{ color: 'rgba(240,216,162,0.4)', fontSize: '0.88rem', lineHeight: 1.65, maxWidth: '20rem', marginBottom: '2.5rem' }}>
              All inquiries are reviewed within 48 hours. We work to find the right fit for both artist and venue.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {INFO_ROWS.map(([k, v]) => (
                <div key={k} style={{
                  display: 'flex', gap: '1.5rem', alignItems: 'baseline',
                  paddingBottom: '1rem', borderBottom: `1px solid rgba(240,216,162,0.07)`,
                }}>
                  <span style={{ color: 'rgba(240,216,162,0.25)', letterSpacing: '0.3em', fontSize: '0.68rem', textTransform: 'uppercase', width: '6rem', flexShrink: 0 }}>{k}</span>
                  <span style={{ color: 'rgba(240,216,162,0.55)', fontSize: '0.88rem' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — form */}
          <div>
            {sent ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingTop: '1rem' }}>
                <div style={{ width: 48, height: 1, background: GOLD }} />
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 900,
                  color: CREAM, fontSize: '2rem', textTransform: 'uppercase', letterSpacing: '-0.01em',
                }}>
                  Inquiry Received
                </h3>
                <p style={{ color: 'rgba(240,216,162,0.42)', fontSize: '0.88rem', lineHeight: 1.65 }}>
                  We&rsquo;ll be in touch within 48 hours. Thanks for reaching out to Camel Ranch Booking.
                </p>
                <button onClick={() => setSent(false)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: GOLD, letterSpacing: '0.25em', fontSize: '0.72rem',
                  textTransform: 'uppercase', padding: 0, textAlign: 'left',
                }}>
                  Submit Another →
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                {([
                  { name: 'name',  label: 'Your Name',      type: 'text',  ph: 'Full Name' },
                  { name: 'email', label: 'Email Address',  type: 'email', ph: 'email@venue.com' },
                  { name: 'venue', label: 'Venue / Event',  type: 'text',  ph: 'Venue name & location' },
                  { name: 'date',  label: 'Proposed Date',  type: 'text',  ph: 'MM/DD/YYYY or flexible' },
                ] as const).map(f => (
                  <div key={f.name} style={{ marginBottom: '1.75rem' }}>
                    <label style={labelStyle}>{f.label}</label>
                    <input
                      name={f.name} type={f.type} placeholder={f.ph}
                      value={form[f.name]} onChange={handle} required
                      style={{ ...inputStyle }}
                      onFocus={focusGold} onBlur={blurNormal}
                    />
                  </div>
                ))}

                <div style={{ marginBottom: '1.75rem' }}>
                  <label style={labelStyle}>Artist</label>
                  <select name="artist" value={form.artist} onChange={handle} required
                    style={{ ...inputStyle, background: BG, cursor: 'pointer' } as React.CSSProperties}
                    onFocus={focusGold} onBlur={blurNormal}
                  >
                    <option value="" disabled>Select an artist…</option>
                    <option value="open">Open to Discussion</option>
                  </select>
                </div>

                <div style={{ marginBottom: '1.75rem' }}>
                  <label style={labelStyle}>Additional Notes</label>
                  <textarea name="notes" value={form.notes} onChange={handle} rows={3}
                    placeholder="Capacity, event type, any other details…"
                    style={{ ...inputStyle } as React.CSSProperties}
                    onFocus={focusGold} onBlur={blurNormal}
                  />
                </div>

                {err && <div style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: '1rem' }}>{err}</div>}

                <button type="submit" disabled={sending} style={{
                  width: '100%', padding: '1rem', background: sending ? 'rgba(200,146,26,0.5)' : GOLD,
                  color: BG, fontSize: '0.72rem', fontWeight: 700,
                  letterSpacing: '0.3em', textTransform: 'uppercase',
                  border: 'none', cursor: sending ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-body)', transition: 'background 0.2s',
                }}>
                  {sending ? 'Sending…' : 'Submit Inquiry'}
                </button>
              </form>
            )}
          </div>

        </div>
      </div>
    </section>
  );
}

/* ── Footer ───────────────────────────────────────────────── */
function Footer() {
  return (
    <footer id="contact" style={{
      background: '#080401', padding: '4rem 2rem',
      borderTop: BORDER,
    }}>
      <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
        <div className="cr-footer-grid" style={{ marginBottom: '4rem' }}>
          <div>
            <div style={{ color: 'rgba(240,216,162,0.22)', fontSize: '0.68rem', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '1rem' }}>Agency</div>
            <Wordmark />
          </div>
          <div>
            <div style={{ color: 'rgba(240,216,162,0.22)', fontSize: '0.68rem', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '1rem' }}>Contact</div>
            <a href="mailto:booking@camelranchbooking.com" style={{
              color: 'rgba(240,216,162,0.52)', fontSize: '0.88rem',
              textDecoration: 'none', display: 'block', marginBottom: '0.5rem',
              transition: 'color 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,216,162,0.52)')}
            >
              booking@camelranchbooking.com
            </a>
          </div>
          <div>
            <div style={{ color: 'rgba(240,216,162,0.22)', fontSize: '0.68rem', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '1rem' }}>Platform</div>
            <Link href="/register" style={{
              color: GOLD, fontSize: '0.88rem', textDecoration: 'none',
              display: 'block', marginBottom: '0.5rem', transition: 'color 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = CREAM)}
              onMouseLeave={e => (e.currentTarget.style.color = GOLD)}
            >
              Create Free Account →
            </Link>
            <Link href="/login" style={{
              color: 'rgba(240,216,162,0.35)', fontSize: '0.82rem',
              textDecoration: 'none', transition: 'color 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = CREAM)}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,216,162,0.35)')}
            >
              Sign In
            </Link>
          </div>
        </div>

        <div style={{ height: 1, background: 'rgba(240,216,162,0.06)', marginBottom: '2rem' }} />

        <div className="cr-footer-bottom">
          <div style={{ color: 'rgba(240,216,162,0.18)', fontSize: '0.68rem', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
            © {new Date().getFullYear()} Camel Ranch Entertainment · All Rights Reserved
          </div>
          <div style={{ color: 'rgba(240,216,162,0.18)', fontSize: '0.68rem', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
            camelranchbooking.com
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ── Page ─────────────────────────────────────────────────── */
export default function Home() {
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
    <>
      <style>{`
        /* Responsive helpers */
        .cr-nav-desktop { display: none !important; }
        .cr-hamburger   { display: flex !important; }

        .cr-hero-content {
          padding: 2rem 1.5rem 5rem;
          padding-top: 7rem;
        }
        .cr-hero-bottom {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .cr-features-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        .cr-booking-grid {
          display: grid;
          gap: 4rem;
        }
        .cr-footer-grid {
          display: grid;
          gap: 2.5rem;
        }
        .cr-footer-bottom {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        @media (min-width: 768px) {
          .cr-nav-desktop { display: flex !important; }
          .cr-hamburger   { display: none !important; }

          .cr-hero-content { padding: 2rem 4rem 5rem; padding-top: 7rem; }
          .cr-hero-bottom  { flex-direction: row; align-items: flex-end; justify-content: space-between; }

          .cr-features-grid { grid-template-columns: repeat(2, 1fr); }
          .cr-booking-grid { grid-template-columns: 1fr 1fr; gap: 5rem; }
          .cr-footer-grid  { grid-template-columns: repeat(3, 1fr); }
          .cr-footer-bottom { flex-direction: row; justify-content: space-between; align-items: center; }
        }

        @media (min-width: 1024px) {
          .cr-hero-content { padding: 2rem 6rem 5rem; padding-top: 7rem; }
          .cr-features-grid { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'var(--font-body)' }}>
        <Nav />
        <Hero />
        <Features />

        {/* Artist success stories */}
        <section id="artists" style={{ borderTop: BORDER }}>
          <div className="cr-hero-content" style={{ background: BG, paddingBottom: '2.5rem', paddingTop: '5rem' }}>
            <div style={{ maxWidth: '68rem', margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ height: 1, width: 48, background: GOLD }} />
                <span style={{ color: GOLD, letterSpacing: '0.4em', fontSize: '0.68rem', textTransform: 'uppercase' }}>Real Results</span>
              </div>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 900,
                lineHeight: 1, textTransform: 'uppercase', margin: '0 0 0.75rem',
                fontSize: 'clamp(2rem,5vw,4rem)', letterSpacing: '-0.01em', color: CREAM,
              }}>
                Artists Growing<br />With This Platform
              </h2>
              <p style={{ color: 'rgba(240,216,162,0.38)', fontSize: '0.88rem', lineHeight: 1.65, maxWidth: '32rem', margin: 0 }}>
                These acts use Camel Ranch Booking to track every show, keep their band informed, and build their careers — one confirmed date at a time.
              </p>
            </div>
          </div>
          <ArtistSpotlight />
        </section>

        <SignUpCTA />
        <Footer />
      </div>
    </>
  );
}
