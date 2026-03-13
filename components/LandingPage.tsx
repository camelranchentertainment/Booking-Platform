'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const validUsers: { [key: string]: string } = {
      'jake@camelranchbooking.com': 'Tornado2023!',
      'scott@camelranchbooking.com': 'Tornado2023!'
    };
    if (validUsers[email.toLowerCase()] === password) {
      localStorage.setItem('loggedInUser', JSON.stringify({ email: email.toLowerCase() }));
      router.push('/dashboard');
    } else {
      setError('Invalid credentials');
    }
  };

  const features = [
    { icon: '🎯', title: 'Smart Venue Discovery',     desc: 'Find the perfect venues for your tour using AI-powered search. Discover bars, clubs, and performance spaces that match your genre and audience.' },
    { icon: '📊', title: 'Campaign Management',        desc: 'Organize your booking runs by region and timeline. Track which venues you\'ve contacted, who\'s responded, and manage confirmations all in one place.' },
    { icon: '✉️', title: 'Automated Outreach',         desc: 'Send personalized booking emails at scale. Save templates, track opens and responses, and never miss a follow-up opportunity.' },
    { icon: '📅', title: '16-Week Planning',           desc: 'Plan your entire tour schedule with our visual calendar. See which weeks need attention and optimize your routing for maximum efficiency.' },
    { icon: '📱', title: 'Social Media Automation',    desc: 'Generate professional social media posts for each confirmed show. AI creates engaging content with hashtags, mentions, and scheduling recommendations.' },
    { icon: '📈', title: 'Analytics & Insights',       desc: 'Track your booking success rates, response times, and campaign performance. Make data-driven decisions about where to tour next.' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #05111f 0%, #0a1f35 100%)', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Navigation */}
      <nav style={{
        padding: '1.25rem 2rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(13,37,64,0.8)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(56,189,248,0.15)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f0f9ff', letterSpacing: '-0.01em' }}>
          🎸 Camel Ranch Booking
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button disabled style={{
            padding: '0.65rem 1.25rem',
            background: 'rgba(255,255,255,0.05)',
            color: '#4a7a9b', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', fontWeight: '600', cursor: 'not-allowed',
            fontSize: '14px',
          }}>
            Sign Up (Coming Soon)
          </button>
          <button onClick={() => setShowLogin(true)} style={{
            padding: '0.65rem 1.5rem',
            background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
            color: '#05111f', border: 'none', borderRadius: '8px',
            fontWeight: '700', cursor: 'pointer', fontSize: '14px',
            boxShadow: '0 4px 14px rgba(56,189,248,0.35)',
            transition: 'opacity 0.2s',
          }}
            onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
          >
            Login
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ padding: '6rem 2rem 5rem', textAlign: 'center', maxWidth: '860px', margin: '0 auto' }}>
        <div style={{
          display: 'inline-block', padding: '6px 16px', borderRadius: '999px',
          background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
          color: '#38bdf8', fontSize: '13px', fontWeight: '600',
          marginBottom: '1.5rem', letterSpacing: '0.04em',
        }}>
          BUILT FOR TOURING MUSICIANS
        </div>
        <h1 style={{
          fontSize: '3.75rem', fontWeight: '800', color: '#f0f9ff',
          marginBottom: '1.5rem', lineHeight: '1.1', letterSpacing: '-0.02em',
        }}>
          Professional Tour Booking<br />
          <span style={{ color: '#38bdf8' }}>Made Simple</span>
        </h1>
        <p style={{
          fontSize: '1.25rem', color: '#7db8d4', marginBottom: '3rem', lineHeight: '1.7',
        }}>
          Streamline venue discovery, manage booking campaigns, and track your outreach — all in one powerful platform built for touring musicians.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button disabled style={{
            padding: '0.9rem 2rem',
            background: 'rgba(255,255,255,0.05)', color: '#4a7a9b',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
            fontWeight: '600', fontSize: '1rem', cursor: 'not-allowed',
          }}>
            Get Started (Coming Soon)
          </button>
          <button onClick={() => setShowLogin(true)} style={{
            padding: '0.9rem 2.5rem',
            background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
            color: '#05111f', border: 'none', borderRadius: '10px',
            fontWeight: '700', fontSize: '1rem', cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(56,189,248,0.4)',
            transition: 'opacity 0.2s',
          }}
            onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
          >
            Sign In →
          </button>
        </div>
      </div>

      {/* Features */}
      <div style={{ padding: '5rem 2rem', background: 'rgba(13,37,64,0.5)', borderTop: '1px solid rgba(56,189,248,0.1)', borderBottom: '1px solid rgba(56,189,248,0.1)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{
            textAlign: 'center', fontSize: '2.25rem', fontWeight: '700',
            color: '#f0f9ff', marginBottom: '0.75rem',
          }}>
            Everything You Need to Book Your Tour
          </h2>
          <p style={{ textAlign: 'center', color: '#7db8d4', marginBottom: '3.5rem', fontSize: '1.1rem' }}>
            One platform. Every tool you need from discovery to confirmed show.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {features.map((f) => (
              <div key={f.title} style={{
                background: '#0d2540',
                border: '1px solid rgba(56,189,248,0.15)',
                borderRadius: '14px', padding: '2rem',
                textAlign: 'center',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                transition: 'border-color 0.2s, transform 0.2s',
              }}
                onMouseOver={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(56,189,248,0.4)';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
                }}
                onMouseOut={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(56,189,248,0.15)';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{f.icon}</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f0f9ff', marginBottom: '0.75rem' }}>
                  {f.title}
                </h3>
                <p style={{ color: '#7db8d4', lineHeight: '1.65', fontSize: '0.95rem', margin: 0 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* About */}
      <div style={{ padding: '5rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={{
            display: 'inline-block', padding: '6px 16px', borderRadius: '999px',
            background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
            color: '#38bdf8', fontSize: '13px', fontWeight: '600',
            marginBottom: '1.5rem',
          }}>
            OUR STORY
          </div>
          <h2 style={{ fontSize: '2.25rem', fontWeight: '700', color: '#f0f9ff', marginBottom: '1.5rem' }}>
            Built by Musicians, for Musicians
          </h2>
          <p style={{ fontSize: '1.1rem', lineHeight: '1.8', color: '#7db8d4', marginBottom: '1.5rem' }}>
            Camel Ranch Booking was created by Better Than Nothin', a country/honky-tonk band touring Arkansas and Missouri. After years of manually tracking venues, sending emails, and managing bookings in spreadsheets, we built the tool we wished existed.
          </p>
          <p style={{ fontSize: '0.95rem', color: '#4a7a9b', fontStyle: 'italic' }}>
            Currently in private beta. Public signups coming soon.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '1.5rem 2rem', textAlign: 'center',
        borderTop: '1px solid rgba(56,189,248,0.1)',
        color: '#4a7a9b', fontSize: '13px',
      }}>
        © {new Date().getFullYear()} Camel Ranch Booking · Built for Better Than Nothin'
      </div>

      {/* Login Modal */}
      {showLogin && (
        <div
          onClick={() => { setShowLogin(false); setError(''); setEmail(''); setPassword(''); }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(5,17,31,0.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: '#0d2540',
            border: '1px solid rgba(56,189,248,0.25)',
            borderRadius: '16px', width: '100%', maxWidth: '440px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '2rem 2rem 1.5rem',
              borderBottom: '1px solid rgba(56,189,248,0.12)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎸</div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f0f9ff', margin: '0 0 0.25rem' }}>
                Welcome Back
              </h2>
              <p style={{ color: '#7db8d4', margin: 0, fontSize: '14px' }}>
                Sign in to your Camel Ranch account
              </p>
            </div>

            {/* Modal form */}
            <form onSubmit={handleLogin} style={{ padding: '1.75rem 2rem 2rem' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{
                  display: 'block', marginBottom: '7px',
                  color: '#7db8d4', fontWeight: '600',
                  fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.09em',
                }}>Email Address</label>
                <input
                  type="email" value={email} required
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: '8px',
                    border: '1px solid #1a3a5c', background: 'rgba(255,255,255,0.03)',
                    color: '#f0f9ff', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box', transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#38bdf8'; e.target.style.boxShadow = '0 0 0 3px rgba(56,189,248,0.15)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#1a3a5c'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block', marginBottom: '7px',
                  color: '#7db8d4', fontWeight: '600',
                  fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.09em',
                }}>Password</label>
                <input
                  type="password" value={password} required
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: '8px',
                    border: '1px solid #1a3a5c', background: 'rgba(255,255,255,0.03)',
                    color: '#f0f9ff', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box', transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#38bdf8'; e.target.style.boxShadow = '0 0 0 3px rgba(56,189,248,0.15)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#1a3a5c'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              {error && (
                <div style={{
                  padding: '10px 14px', background: 'rgba(248,113,113,0.1)',
                  border: '1px solid rgba(248,113,113,0.3)',
                  color: '#f87171', borderRadius: '8px',
                  marginBottom: '1.25rem', textAlign: 'center', fontSize: '14px',
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => { setShowLogin(false); setError(''); setEmail(''); setPassword(''); }}
                  style={{
                    flex: 1, padding: '11px',
                    background: 'transparent', color: '#7db8d4',
                    border: '1px solid rgba(56,189,248,0.3)', borderRadius: '8px',
                    fontWeight: '600', cursor: 'pointer', fontSize: '14px',
                    transition: 'background 0.2s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(56,189,248,0.05)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1, padding: '11px',
                    background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
                    color: '#05111f', border: 'none', borderRadius: '8px',
                    fontWeight: '700', cursor: 'pointer', fontSize: '14px',
                    boxShadow: '0 4px 14px rgba(56,189,248,0.35)',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                >
                  Sign In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
