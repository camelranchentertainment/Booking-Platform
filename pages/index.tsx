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
      // Store session for dashboard auth check
      localStorage.setItem('loggedInUser', JSON.stringify({
        id:       data.userId,
        email:    data.email,
        bandName: data.bandName,
        tier:     data.subscriptionTier,
        token:    data.accessToken,
      }));
      router.push('/dashboard');
    } catch (err: any) { setAuthError(err.message); }
    finally { setLoading(false); }
  };

  const tierLabel = signupTier === 'free' ? 'Free Plan'
    : signupTier === 'basic' ? 'Basic — $10/mo' : 'Premium — $18/mo';

  // ─── Shared style helpers ──────────────────────────────────────────────────
  const S = {
    page: {
      fontFamily: "'Nunito', sans-serif",
      background: '#030d18',
      color: '#e8f1f8',
      minHeight: '100vh',
      overflowX: 'hidden' as const,
    },
    sectionLabel: {
      color: '#4a85c8', fontWeight: 700 as const, fontSize: 13,
      letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 14,
    },
    h2: {
      fontFamily: "'Bebas Neue', cursive", fontWeight: 400 as const,
      fontSize: 'clamp(2.2rem,4.5vw,3.4rem)', color: '#e8f1f8',
      letterSpacing: '0.04em', lineHeight: 1.1 as const, margin: '0 0 18px',
    },
    sub: {
      color: '#7aa5c4', fontSize: 'clamp(1rem,1.8vw,1.1rem)',
      lineHeight: 1.75 as const, maxWidth: 560, margin: '0 auto',
    },
    card: {
      background: 'rgba(10,26,44,0.7)',
      border: '1px solid rgba(74,133,200,0.15)',
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
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #030d18; font-family: 'Nunito', sans-serif; }
        ::selection { background: rgba(74,133,200,0.3); }
        input::placeholder { color: #3d6285; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .fade-up   { animation: fadeUp .7s ease both; }
        .fade-up-2 { animation: fadeUp .7s .15s ease both; }
        .fade-up-3 { animation: fadeUp .7s .28s ease both; }
        .fade-up-4 { animation: fadeUp .7s .4s  ease both; }

        .feature-card:hover {
          border-color: rgba(74,133,200,0.42) !important;
          transform: translateY(-5px);
          box-shadow: 0 16px 48px rgba(74,133,200,0.12);
        }
        .step-card:hover {
          border-color: rgba(74,133,200,0.42) !important;
          transform: translateY(-4px);
        }
        .btn-primary {
          background: linear-gradient(135deg, #3a7fc1, #2563a8);
          border: none; border-radius: 10px; color: #e8f1f8;
          font-weight: 700; cursor: pointer;
          box-shadow: 0 6px 24px rgba(37,99,168,0.45);
          transition: transform .15s, box-shadow .15s, opacity .15s;
          font-family: 'Nunito', sans-serif;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(37,99,168,0.6);
        }
        .btn-ghost {
          background: transparent;
          border: 1px solid rgba(74,133,200,0.38);
          border-radius: 10px; color: #6baed6;
          font-weight: 600; cursor: pointer;
          transition: background .2s, border-color .2s;
          font-family: 'Nunito', sans-serif;
        }
        .btn-ghost:hover {
          background: rgba(74,133,200,0.08);
          border-color: rgba(74,133,200,0.55);
        }

        .shimmer-text {
          background: linear-gradient(90deg, #4a85c8, #93c5fd, #4a85c8);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 4s linear infinite;
        }
        .pricing-highlight {
          background: linear-gradient(160deg, #091828, #0e2540);
          border: 1px solid rgba(74,133,200,0.45) !important;
          box-shadow: 0 8px 48px rgba(37,99,168,0.2);
        }
        .form-input {
          width: 100%; padding: 10px 14px;
          background: #091828; border: 1px solid rgba(74,133,200,0.22);
          border-radius: 8px; color: #e8f1f8; font-size: 14px;
          outline: none; font-family: 'Nunito', sans-serif;
          transition: border-color .2s;
        }
        .form-input:focus { border-color: rgba(74,133,200,0.55); }
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
          background: scrolled ? 'rgba(3,13,24,0.94)' : 'transparent',
          backdropFilter: scrolled ? 'blur(18px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(74,133,200,0.12)' : 'none',
          transition: 'all .3s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #4a85c8, #2563a8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 800, color: '#e8f1f8',
              fontFamily: "'Bebas Neue', cursive",
            }}>C</div>
            <span style={{ fontFamily: "'Bebas Neue', cursive", fontWeight: 400, fontSize: '1.2rem', letterSpacing: '0.05em' }}>
              Camel Ranch Booking
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {[['How It Works','workflow'],['Features','features'],['Pricing','pricing']].map(([label, id]) => (
              <a key={id} href={`#${id}`} onClick={smooth(id)} style={{
                color: '#7aa5c4', fontSize: 13, fontWeight: 600,
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
            width:900, height:420, background:'radial-gradient(ellipse, rgba(37,99,168,0.14) 0%, transparent 68%)',
            pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:'10%', right:'5%',
            width:320, height:320, background:'radial-gradient(ellipse, rgba(37,99,168,0.08) 0%, transparent 70%)',
            pointerEvents:'none' }} />

          <div className="fade-up" style={{
            display:'inline-flex', alignItems:'center', gap:8,
            background:'rgba(74,133,200,0.1)', border:'1px solid rgba(74,133,200,0.25)',
            borderRadius:999, padding:'6px 18px', marginBottom:'1.75rem',
            fontSize:13, color:'#6baed6', fontWeight:700,
          }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'#4a85c8',
              display:'inline-block', animation:'pulse 2s infinite' }} />
            Built for Bands That Tour
          </div>

          <h1 className="fade-up-2" style={{
            fontFamily:"'Bebas Neue', cursive", fontWeight:400,
            fontSize:'clamp(2.6rem,5.5vw,4.2rem)', lineHeight:1.05,
            letterSpacing:'0.04em', maxWidth:760, marginBottom:'1.4rem',
          }}>
            Stop Chasing Gigs.<br />
            <span className="shimmer-text">Start Booking Them.</span>
          </h1>

          <p className="fade-up-3" style={{
            color:'#7aa5c4', fontSize:'clamp(1rem,2vw,1.15rem)',
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
              <div key={label} style={{ display:'flex', alignItems:'center', gap:8, color:'#3d6285', fontSize:14, fontWeight:600 }}>
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
                num:'01', icon:'🔍', color:'#4a85c8',
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
                border:'1px solid rgba(74,133,200,0.1)',
                borderRadius:16, padding:'1.75rem 2rem',
                transition:'border-color .2s, transform .2s',
              }}>
                <div style={{
                  fontFamily:"'Bebas Neue', cursive", fontWeight:800,
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
                  <h3 style={{ fontFamily:"'Bebas Neue', cursive", fontWeight:700, fontSize:'1.1rem', color:'#e8f1f8', marginBottom:6 }}>
                    {step.title}
                  </h3>
                  <p style={{ color:'#7aa5c4', fontSize:14, lineHeight:1.7, margin:0 }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ────────────────────────────────────────────────────── FEATURES */}
        <section id="features" style={{ padding:'100px 2rem', background:'linear-gradient(180deg, transparent, rgba(74,133,200,0.03) 50%, transparent)' }}>
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
                  icon:'🔍', color:'#4a85c8', bg:'rgba(74,133,200,0.08)',
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
                {
                  icon:'📅', color:'#4ade80', bg:'rgba(74,222,128,0.08)',
                  title:'Band Calendar',
                  caption:'See the whole picture.',
                  body:'Your confirmed shows, follow-up reminders, and open dates — all on one calendar. Spot gaps, plan ahead, and never lose track of what\'s coming.',
                },
                {
                  icon:'⚙️', color:'#fbbf24', bg:'rgba(251,191,36,0.08)',
                  title:'Setup & Integrations',
                  caption:'Connected in minutes.',
                  body:'Step-by-step guides to link your email account, sync your calendar, and connect social media. Get everything talking to each other before your first search.',
                },
              ].map((f, i) => (
                <div key={i} className="feature-card" style={{
                  background:'rgba(13,37,64,0.5)',
                  border:'1px solid rgba(74,133,200,0.1)',
                  borderRadius:16, padding:'2rem',
                  transition:'border-color .2s, transform .2s, box-shadow .2s',
                }}>
                  <div className="module-icon" style={{ background:f.bg, border:`1px solid ${f.color}25` }}>
                    {f.icon}
                  </div>
                  <p style={{ color:f.color, fontWeight:700, fontSize:12, letterSpacing:'0.1em',
                    textTransform:'uppercase', marginBottom:6 }}>{f.caption}</p>
                  <h3 style={{ fontFamily:"'Bebas Neue', cursive", fontWeight:700, fontSize:'1.15rem',
                    color:'#e8f1f8', marginBottom:10 }}>{f.title}</h3>
                  <p style={{ color:'#7aa5c4', fontSize:14, lineHeight:1.7, margin:0 }}>{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────── SOCIAL PROOF */}
        <section style={{ padding:'80px 2rem', maxWidth:900, margin:'0 auto', textAlign:'center' }}>
          <div style={{
            background:'rgba(13,37,64,0.6)',
            border:'1px solid rgba(74,133,200,0.12)',
            borderRadius:20, padding:'3rem 2.5rem',
          }}>
            <div style={{ fontSize:40, marginBottom:20 }}>🎸</div>
            <p style={{ fontFamily:"'Bebas Neue', cursive", fontWeight:700, fontSize:'clamp(1.3rem,3vw,1.8rem)',
              color:'#e8f1f8', lineHeight:1.4, marginBottom:16 }}>
              "We used to spend two hours a weekend making phone calls and sending emails just to book one date.
              Now we run the whole outreach from one screen."
            </p>
            <p style={{ color:'#4a85c8', fontWeight:600, fontSize:14 }}>Jake Stringer — Better Than Nothin'</p>
            <p style={{ color:'#3d6285', fontSize:13, marginTop:2 }}>Touring Arkansas & Missouri</p>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────── PRICING */}
        <section id="pricing" style={{ padding:'100px 2rem 120px', maxWidth:1100, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:'4rem' }}>
            <p style={S.sectionLabel}>Simple Pricing</p>
            <h2 style={{ ...S.h2, textAlign:'center' }}>Start Free. Scale When You're Ready.</h2>
            <p style={{ ...S.sub, textAlign:'center' }}>
              No contracts. No surprises. Cancel anytime from your account.
              Paid plans unlock unlimited searches and advanced tools.
            </p>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:24, alignItems:'start' }}>
            <PricingCard
              name="Free" price="$0" period="forever"
              desc="Try the whole platform with no commitment."
              badge={null} highlight={false}
              features={[
                '5 venue searches per month',
                'Runs & tour management',
                'Email outreach tools',
                'Band calendar',
                'Social media generator',
                'Full platform access',
              ]}
              cta="Sign Up Free"
              onCta={() => openSignup('free')}
            />
            <PricingCard
              name="Basic" price="$10" period="per month"
              desc="For bands actively booking 2–3 nights a month."
              badge={null} highlight={false}
              features={[
                'Unlimited venue searches',
                'Unlimited Runs',
                'Email templates & tracking',
                'Social post generation',
                'Calendar sync',
                'Priority support',
              ]}
              cta="Get Basic"
              onCta={() => openSignup('basic')}
            />
            <PricingCard
              name="Premium" price="$18" period="per month"
              desc="For serious touring acts running full regional campaigns."
              badge="Most Popular" highlight={true}
              features={[
                'Everything in Basic',
                'Bulk venue discovery by region',
                'Full email template library',
                'Advanced campaign analytics',
                'Multi-platform social scheduling',
                'Dedicated support',
              ]}
              cta="Get Premium"
              onCta={() => openSignup('premium')}
            />
          </div>

          <p style={{ textAlign:'center', color:'#3d6285', fontSize:13, marginTop:28 }}>
            Payments securely handled by <strong style={{ color:'#7aa5c4' }}>Stripe</strong>. You can cancel or change plans anytime.
          </p>
        </section>

        {/* ─────────────────────────────────────────────────────── FOOTER */}
        <footer style={{
          borderTop:'1px solid rgba(74,133,200,0.1)',
          padding:'3rem 2rem', textAlign:'center',
        }}>
          <div style={{ fontFamily:"'Bebas Neue', cursive", fontWeight:700, color:'#7aa5c4', marginBottom:8, fontSize:'1rem' }}>
            Camel Ranch Booking
          </div>
          <p style={{ color:'#3d6285', fontSize:13 }}>
            © {new Date().getFullYear()} Camel Ranch Booking. All rights reserved.
          </p>
        </footer>

      </div>{/* end page */}

      {/* ──────────────────────────────────────────────────── LOGIN MODAL */}
      {showLogin && (
        <Modal onClose={() => { setShowLogin(false); setAuthError(''); }}>
          <h2 style={{ fontFamily:"'Bebas Neue', cursive", fontWeight:800, fontSize:'1.65rem', marginBottom:6 }}>Welcome Back</h2>
          <p style={{ color:'#7aa5c4', fontSize:14, marginBottom:24 }}>Sign in to your Camel Ranch account</p>
          {authError && <ErrBox msg={authError} />}
          <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Field label="Email" type="email"     value={email}    onChange={setEmail}    ph="you@email.com" />
            <Field label="Password" type="password" value={password} onChange={setPassword} ph="Your password" />
            <ModalBtns cancel={() => { setShowLogin(false); setAuthError(''); }}
              submit={loading ? 'Signing In…' : 'Sign In'} disabled={loading} />
          </form>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────── SIGNUP MODAL */}
      {showSignup && (
        <Modal onClose={() => { setShowSignup(false); setAuthError(''); }}>
          <div style={{
            display:'inline-block', padding:'4px 14px', borderRadius:999, marginBottom:12,
            background:'rgba(74,133,200,0.1)', border:'1px solid rgba(74,133,200,0.2)',
            color:'#4a85c8', fontSize:12, fontWeight:700,
          }}>{tierLabel}</div>
          <h2 style={{ fontFamily:"'Bebas Neue', cursive", fontWeight:800, fontSize:'1.65rem', marginBottom:6 }}>Create Your Account</h2>
          <p style={{ color:'#7aa5c4', fontSize:14, marginBottom:24 }}>
            {signupTier === 'free'
              ? 'Full platform access. 5 free searches per month.'
              : 'Complete your account, then you\'ll be taken to Stripe to finish payment.'}
          </p>
          {authError && <ErrBox msg={authError} />}
          <form onSubmit={handleSignup} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Field label="Your Name"  type="text"     value={name}     onChange={setName}     ph="First & Last Name" />
            <Field label="Band Name"  type="text"     value={bandName} onChange={setBandName} ph="e.g. Jake Stringer & Better Than Nothin'" />
            <Field label="Email"      type="email"    value={email}    onChange={setEmail}    ph="you@email.com" />
            <Field label="Password"   type="password" value={password} onChange={setPassword} ph="Minimum 8 characters" />
            <ModalBtns cancel={() => { setShowSignup(false); setAuthError(''); }}
              submit={loading ? 'Creating Account…' : signupTier === 'free' ? 'Create Free Account' : 'Continue to Payment →'}
              disabled={loading} />
          </form>
        </Modal>
      )}
    </>
  );
}

// ─── Pricing Card ─────────────────────────────────────────────────────────────
function PricingCard({ name, price, period, desc, badge, highlight, features, cta, onCta }: {
  name:string; price:string; period:string; desc:string;
  badge:string|null; highlight:boolean; features:string[];
  cta:string; onCta:()=>void;
}) {
  return (
    <div className={highlight ? 'pricing-highlight' : ''} style={{
      background: highlight ? undefined : 'rgba(13,37,64,0.5)',
      border: highlight ? undefined : '1px solid rgba(74,133,200,0.12)',
      borderRadius:18, padding:'2rem', position:'relative',
    }}>
      {badge && (
        <div style={{
          position:'absolute', top:-13, left:'50%', transform:'translateX(-50%)',
          background:'linear-gradient(135deg, #4a85c8, #2563a8)',
          color:'#030d18', fontWeight:700, fontSize:11,
          padding:'4px 16px', borderRadius:999, whiteSpace:'nowrap',
        }}>{badge}</div>
      )}
      <div style={{ marginBottom:'1.5rem' }}>
        <div style={{ fontFamily:"'Bebas Neue', cursive", fontWeight:700, fontSize:'1.05rem', color:'#e8f1f8', marginBottom:4 }}>{name}</div>
        <div style={{ display:'flex', alignItems:'baseline', gap:6, margin:'10px 0 8px' }}>
          <span style={{ fontFamily:"'Bebas Neue', cursive", fontSize:'2.8rem', fontWeight:800, color:'#e8f1f8', lineHeight:1 }}>{price}</span>
          <span style={{ color:'#3d6285', fontSize:13 }}>/{period}</span>
        </div>
        <p style={{ color:'#7aa5c4', fontSize:13, lineHeight:1.55, margin:0 }}>{desc}</p>
      </div>
      <div style={{ borderTop:'1px solid rgba(74,133,200,0.1)', paddingTop:'1.5rem', marginBottom:'1.75rem' }}>
        {features.map((f,i) => (
          <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:10 }}>
            <span style={{ color:'#4a85c8', flexShrink:0, marginTop:1 }}>✓</span>
            <span style={{ color:'#7aa5c4', fontSize:14 }}>{f}</span>
          </div>
        ))}
      </div>
      <button onClick={onCta} className={highlight ? 'btn-primary' : 'btn-ghost'}
        style={{ width:'100%', padding:13, fontSize:15, borderRadius:10 }}>
        {cta}
      </button>
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────
function Modal({ children, onClose }: { children:React.ReactNode; onClose:()=>void }) {
  return (
    <div onClick={e => { if (e.target===e.currentTarget) onClose(); }} style={{
      position:'fixed', inset:0, zIndex:200,
      background:'rgba(5,17,31,0.88)', backdropFilter:'blur(12px)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem',
    }}>
      <div style={{
        background:'#091828', border:'1px solid rgba(74,133,200,0.18)',
        borderRadius:20, padding:'2.5rem', width:'100%', maxWidth:460,
        boxShadow:'0 24px 80px rgba(0,0,0,0.6)',
      }}>{children}</div>
    </div>
  );
}

// ─── Form field ───────────────────────────────────────────────────────────────
function Field({ label, type, value, onChange, ph }: {
  label:string; type:string; value:string; onChange:(v:string)=>void; ph:string;
}) {
  return (
    <div>
      <label style={{ display:'block', color:'#7aa5c4', fontSize:13, fontWeight:600, marginBottom:6 }}>{label}</label>
      <input type={type} value={value} placeholder={ph} required
        onChange={e=>onChange(e.target.value)} className="form-input" />
    </div>
  );
}

// ─── Error box ────────────────────────────────────────────────────────────────
function ErrBox({ msg }: { msg:string }) {
  return (
    <div style={{
      background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.25)',
      borderRadius:8, padding:'10px 14px', color:'#f87171', fontSize:14, marginBottom:14,
    }}>{msg}</div>
  );
}

// ─── Modal action buttons ─────────────────────────────────────────────────────
function ModalBtns({ cancel, submit, disabled }: { cancel:()=>void; submit:string; disabled:boolean }) {
  return (
    <div style={{ display:'flex', gap:10, marginTop:4 }}>
      <button type="button" onClick={cancel} className="btn-ghost"
        style={{ flex:1, padding:11, fontSize:14 }}>Cancel</button>
      <button type="submit" disabled={disabled} className="btn-primary"
        style={{ flex:1, padding:11, fontSize:14, opacity:disabled?0.6:1 }}>{submit}</button>
    </div>
  );
}
