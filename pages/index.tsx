import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

const STRIPE_PRICE_BASIC   = process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC   || 'price_REPLACE_BASIC';
const STRIPE_PRICE_PREMIUM = process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM || 'price_REPLACE_PREMIUM';

export default function LandingPage() {
  const router = useRouter();
  const [scrolled, setScrolled]     = useState(false);
  const [showLogin, setShowLogin]   = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [signupTier, setSignupTier] = useState<'free'|'basic'|'premium'>('free');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [name, setName]             = useState('');
  const [bandName, setBandName]     = useState('');
  const [authError, setAuthError]   = useState('');
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const smooth = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const openSignup = (tier: 'free'|'basic'|'premium') => {
    setSignupTier(tier); setShowSignup(true); setAuthError('');
    setEmail(''); setPassword(''); setName(''); setBandName('');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setAuthError('');
    try {
      const res  = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, bandName, tier: signupTier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      if (signupTier !== 'free') {
        const priceId = signupTier === 'basic' ? STRIPE_PRICE_BASIC : STRIPE_PRICE_PREMIUM;
        const cr   = await fetch('/api/stripe/create-checkout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId, email, userId: data.userId }),
        });
        const checkout = await cr.json();
        if (checkout.url) { window.location.href = checkout.url; return; }
      }
      router.push('/dashboard');
    } catch (err: any) { setAuthError(err.message); }
    finally { setLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setAuthError('');
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      router.push('/dashboard');
    } catch (err: any) { setAuthError(err.message); }
    finally { setLoading(false); }
  };

  const tierLabel = signupTier === 'free' ? 'Free Plan'
    : signupTier === 'basic' ? 'Basic — $10/mo' : 'Premium — $18/mo';

  // ─── Shared style helpers ──────────────────────────────────────────────────
  const S = {
    page: {
      fontFamily: "'DM Sans', sans-serif",
      background: '#05111f',
      color: '#f0f9ff',
      minHeight: '100vh',
      overflowX: 'hidden' as const,
    },
    sectionLabel: {
      color: '#38bdf8', fontWeight: 700 as const, fontSize: 13,
      letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 14,
    },
    h2: {
      fontFamily: "'Syne', sans-serif", fontWeight: 800 as const,
      fontSize: 'clamp(2rem,4.5vw,3.2rem)', color: '#f0f9ff',
      letterSpacing: '-0.025em', lineHeight: 1.1 as const, margin: '0 0 18px',
    },
    sub: {
      color: '#7db8d4', fontSize: 'clamp(1rem,1.8vw,1.15rem)',
      lineHeight: 1.7 as const, maxWidth: 560, margin: '0 auto',
    },
    card: {
      background: 'rgba(13,37,64,0.55)',
      border: '1px solid rgba(56,189,248,0.13)',
      borderRadius: 16, padding: '2rem',
      transition: 'border-color .2s, transform .2s, box-shadow .2s',
    },
  };

  return (
    <>
      <Head>
        <title>Camel Ranch Booking — Play More Shows</title>
        <meta name="description" content="The all-in-one booking platform for touring bands. Find venues, plan runs, send outreach, post on social, and keep your calendar packed." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,700;1,300&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #05111f; }
        ::selection { background: rgba(56,189,248,0.3); }
        input::placeholder { color: #4a7a9b; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .fade-up { animation: fadeUp .7s ease both; }
        .fade-up-2 { animation: fadeUp .7s .15s ease both; }
        .fade-up-3 { animation: fadeUp .7s .28s ease both; }
        .fade-up-4 { animation: fadeUp .7s .4s ease both; }
        .float-card { animation: float 5s ease-in-out infinite; }

        .feature-card:hover {
          border-color: rgba(56,189,248,0.38) !important;
          transform: translateY(-5px);
          box-shadow: 0 16px 48px rgba(56,189,248,0.1);
        }
        .step-card:hover {
          border-color: rgba(56,189,248,0.38) !important;
          transform: translateY(-4px);
        }
        .btn-primary {
          background: linear-gradient(135deg, #38bdf8, #0ea5e9);
          border: none; border-radius: 10px; color: #05111f;
          font-weight: 700; cursor: pointer;
          box-shadow: 0 6px 24px rgba(56,189,248,0.38);
          transition: transform .15s, box-shadow .15s, opacity .15s;
          font-family: 'DM Sans', sans-serif;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(56,189,248,0.5);
        }
        .btn-ghost {
          background: transparent;
          border: 1px solid rgba(56,189,248,0.32);
          border-radius: 10px; color: #38bdf8;
          font-weight: 600; cursor: pointer;
          transition: background .2s;
          font-family: 'DM Sans', sans-serif;
        }
        .btn-ghost:hover { background: rgba(56,189,248,0.07); }

        .shimmer-text {
          background: linear-gradient(90deg, #38bdf8, #7dd3fc, #38bdf8);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3s linear infinite;
        }
        .pricing-highlight {
          background: linear-gradient(160deg, #0d2540, #0f2a4a);
          border: 1px solid rgba(56,189,248,0.42) !important;
          box-shadow: 0 8px 48px rgba(56,189,248,0.16);
        }
        .form-input {
          width: 100%; padding: 10px 14px;
          background: #0d2540; border: 1px solid rgba(56,189,248,0.2);
          border-radius: 8px; color: #f0f9ff; font-size: 14px;
          outline: none; font-family: 'DM Sans', sans-serif;
          transition: border-color .2s;
        }
        .form-input:focus { border-color: rgba(56,189,248,0.5); }
        .module-icon {
          width: 52px; height: 52px; border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          font-size: 24px; margin-bottom: 20px; flex-shrink: 0;
        }
      `}</style>

      <div style={S.page}>

        {/* ────────────────────────────────────────────────────────── NAV */}
        <nav style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          height: 64, padding: '0 2rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: scrolled ? 'rgba(5,17,31,0.92)' : 'transparent',
          backdropFilter: scrolled ? 'blur(18px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(56,189,248,0.1)' : 'none',
          transition: 'all .3s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 800, color: '#05111f',
              fontFamily: "'Syne', sans-serif",
            }}>C</div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '1.05rem' }}>
              Camel Ranch Booking
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {[['How It Works','workflow'],['Features','features'],['Pricing','pricing']].map(([label, id]) => (
              <a key={id} href={`#${id}`} onClick={smooth(id)} style={{
                color: '#7db8d4', fontSize: 13, fontWeight: 500,
                textDecoration: 'none', padding: '0 12px',
              }}>{label}</a>
            ))}
            <button className="btn-ghost" onClick={() => { setShowLogin(true); setAuthError(''); setEmail(''); setPassword(''); }}
              style={{ padding: '8px 18px', fontSize: 13 }}>Sign In</button>
            <button className="btn-primary" onClick={() => openSignup('free')}
              style={{ padding: '8px 18px', fontSize: 13 }}>Get Started</button>
          </div>
        </nav>

        {/* ────────────────────────────────────────────────────────── HERO */}
        <section style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '120px 2rem 80px', textAlign: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Ambient glows */}
          <div style={{ position:'absolute', top:'15%', left:'50%', transform:'translateX(-50%)',
            width:900, height:420, background:'radial-gradient(ellipse, rgba(56,189,248,0.1) 0%, transparent 68%)',
            pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:'10%', right:'5%',
            width:320, height:320, background:'radial-gradient(ellipse, rgba(14,165,233,0.07) 0%, transparent 70%)',
            pointerEvents:'none' }} />

          <div className="fade-up" style={{
            display:'inline-flex', alignItems:'center', gap:8,
            background:'rgba(56,189,248,0.08)', border:'1px solid rgba(56,189,248,0.2)',
            borderRadius:999, padding:'6px 18px', marginBottom:'1.75rem',
            fontSize:13, color:'#38bdf8', fontWeight:600,
          }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'#38bdf8',
              display:'inline-block', animation:'pulse 2s infinite' }} />
            Built for Bands That Tour
          </div>

          <h1 className="fade-up-2" style={{
            fontFamily:"'Syne', sans-serif", fontWeight:800,
            fontSize:'clamp(3rem,8vw,6rem)', lineHeight:1.0,
            letterSpacing:'-0.035em', maxWidth:900, marginBottom:'1.4rem',
          }}>
            Stop Chasing Gigs.<br />
            <span className="shimmer-text">Start Booking Them.</span>
          </h1>

          <p className="fade-up-3" style={{
            color:'#7db8d4', fontSize:'clamp(1rem,2vw,1.2rem)',
            maxWidth:580, lineHeight:1.75, marginBottom:'2.5rem',
          }}>
            Camel Ranch Booking gives touring bands one place to find venues,
            plan runs, send outreach, and keep the calendar full — without the
            spreadsheet chaos.
          </p>

          <div className="fade-up-4" style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' }}>
            <button className="btn-primary" onClick={() => openSignup('free')}
              style={{ padding:'14px 34px', fontSize:'1rem' }}>
              Start for Free →
            </button>
            <a href="#workflow" onClick={smooth('workflow')} className="btn-ghost"
              style={{ padding:'14px 34px', fontSize:'1rem', textDecoration:'none', display:'inline-block' }}>
              See How It Works
            </a>
          </div>

          <div style={{
            display:'flex', gap:48, marginTop:'4.5rem',
            justifyContent:'center', flexWrap:'wrap',
          }}>
            {[['Find venues fast','🗺️'],['Plan full runs','📅'],['Send smarter emails','✉️'],['Post every show','📣']].map(([label,icon]) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:8, color:'#4a7a9b', fontSize:14, fontWeight:500 }}>
                <span>{icon}</span>{label}
              </div>
            ))}
          </div>
        </section>

        {/* ────────────────────────────────────────────────── HOW IT WORKS */}
        <section id="workflow" style={{ padding:'100px 2rem', maxWidth:1100, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:'4rem' }}>
            <p style={S.sectionLabel}>Streamlined Workflow</p>
            <h2 style={{ ...S.h2, textAlign:'center' }}>From Search to Showtime in 5 Steps</h2>
            <p style={{ ...S.sub, textAlign:'center' }}>
              Every tool connects to the next. One platform. Zero duplicate work.
            </p>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            {[
              {
                num:'01', icon:'🔍', color:'#38bdf8',
                title:'Search for Venues',
                body:'Tell us where you want to play. Our venue discovery pulls bars, honky-tonks, event centers, and stages in any city or region — instantly.'
              },
              {
                num:'02', icon:'🛣️', color:'#2dd4bf',
                title:'Build a Run',
                body:'Group your target venues into a Run — your planned tour stretch. Add cities, set a date range, and watch your pipeline take shape.'
              },
              {
                num:'03', icon:'✉️', color:'#a78bfa',
                title:'Send Booking Emails',
                body:'Pick a template, review the venues, and send. Track who opened, who replied, and who needs a follow-up — all without leaving the platform.'
              },
              {
                num:'04', icon:'📣', color:'#fb923c',
                title:'Promote Confirmed Dates',
                body:'Once a gig is confirmed, generate social posts for it in one click. Ready-made captions for Facebook, Instagram, and more — tailored to each show.'
              },
              {
                num:'05', icon:'📅', color:'#4ade80',
                title:'Keep Your Calendar',
                body:'Confirmed gigs land on your band calendar automatically. See your month at a glance, spot open weekends, and never double-book again.'
              },
            ].map((step, i) => (
              <div key={i} className="step-card" style={{
                display:'flex', alignItems:'flex-start', gap:'1.5rem',
                background:'rgba(13,37,64,0.5)',
                border:'1px solid rgba(56,189,248,0.1)',
                borderRadius:16, padding:'1.75rem 2rem',
                transition:'border-color .2s, transform .2s',
              }}>
                <div style={{
                  fontFamily:"'Syne', sans-serif", fontWeight:800,
                  fontSize:'2.2rem', color:step.color, lineHeight:1,
                  opacity:0.35, flexShrink:0, width:56, textAlign:'center',
                }}>{step.num}</div>
                <div style={{
                  width:48, height:48, borderRadius:12, flexShrink:0,
                  background:`${step.color}18`,
                  border:`1px solid ${step.color}30`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:22,
                }}>{step.icon}</div>
                <div>
                  <h3 style={{ fontFamily:"'Syne', sans-serif", fontWeight:700, fontSize:'1.1rem', color:'#f0f9ff', marginBottom:6 }}>
                    {step.title}
                  </h3>
                  <p style={{ color:'#7db8d4', fontSize:14, lineHeight:1.7, margin:0 }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ────────────────────────────────────────────────────── FEATURES */}
        <section id="features" style={{ padding:'100px 2rem', background:'linear-gradient(180deg, transparent, rgba(56,189,248,0.03) 50%, transparent)' }}>
          <div style={{ maxWidth:1100, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:'4rem' }}>
              <p style={S.sectionLabel}>Platform Modules</p>
              <h2 style={{ ...S.h2, textAlign:'center' }}>Everything Your Band Needs to Book</h2>
              <p style={{ ...S.sub, textAlign:'center' }}>
                Six purpose-built tools, working together — no duct tape required.
              </p>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(310px, 1fr))', gap:24 }}>
              {[
                {
                  icon:'🔍', color:'#38bdf8', bg:'rgba(56,189,248,0.08)',
                  title:'Venue Search',
                  caption:'Find the right rooms.',
                  body:'Search any city or region and surface venues that actually host live music. Filter by type, view contact details, and add to your pipeline in seconds.',
                },
                {
                  icon:'🛣️', color:'#2dd4bf', bg:'rgba(45,212,191,0.08)',
                  title:'Runs & Tours',
                  caption:'Plan the whole stretch.',
                  body:'Organize venues into Runs — your tour legs. Track who you\'ve contacted, who confirmed, who passed, and what\'s still open. Your whole booking pipeline in one board.',
                },
                {
                  icon:'✉️', color:'#a78bfa', bg:'rgba(167,139,250,0.08)',
                  title:'Email Outreach',
                  caption:'Templates that get replies.',
                  body:'Build a library of booking emails — initial contact, follow-up, confirmation. Send to multiple venues at once and track every response without switching tabs.',
                },
                {
                  icon:'📣', color:'#fb923c', bg:'rgba(251,146,60,0.08)',
                  title:'Social Media',
                  caption:'Hype every confirmed show.',
                  body:'Generate ready-to-post social content for each confirmed gig. Tied directly to your Runs, so every date gets promoted without writing a single caption from scratch.',
                },
                
