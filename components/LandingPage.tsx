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
      localStorage.setItem('isAuthenticated', 'true');
      router.push('/dashboard');
    } else {
      setError('Invalid credentials');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #F5F5F0 0%, #E8E6E1 100%)' }}>
      {/* Navigation */}
      <nav style={{
        padding: '1.5rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(93,78,55,0.1)'
      }}>
        <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#5D4E37' }}>
          🎸 Camel Ranch Booking
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            disabled
            style={{
              padding: '0.75rem 1.5rem',
              background: '#D3D3D3',
              color: '#A8A8A8',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'not-allowed',
              opacity: 0.6
            }}
          >
            Sign Up (Coming Soon)
          </button>
          <button
            onClick={() => setShowLogin(true)}
            style={{
              padding: '0.75rem 1.75rem',
              background: '#5D4E37',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#4a3f2d'}
            onMouseOut={(e) => e.currentTarget.style.background = '#5D4E37'}
          >
            Login
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <div style={{
        padding: '4rem 2rem',
        textAlign: 'center',
        maxWidth: '900px',
        margin: '0 auto'
      }}>
        <h1 style={{
          fontSize: '3.5rem',
          fontWeight: '800',
          color: '#5D4E37',
          marginBottom: '1.5rem',
          lineHeight: '1.1'
        }}>
          Professional Tour Booking Made Simple
        </h1>
        <p style={{
          fontSize: '1.35rem',
          color: '#708090',
          marginBottom: '3rem',
          lineHeight: '1.6'
        }}>
          Streamline venue discovery, manage booking campaigns, and track your outreach—all in one powerful platform built for touring musicians.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            disabled
            style={{
              padding: '1rem 2.5rem',
              background: '#D3D3D3',
              color: '#A8A8A8',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '1.1rem',
              cursor: 'not-allowed',
              opacity: 0.6
            }}
          >
            Get Started (Coming Soon)
          </button>
          <button
            onClick={() => setShowLogin(true)}
            style={{
              padding: '1rem 2.5rem',
              background: 'transparent',
              color: '#5D4E37',
              border: '2px solid #5D4E37',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '1.1rem',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#5D4E37';
              e.currentTarget.style.color = 'white';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#5D4E37';
            }}
          >
            Sign In →
          </button>
        </div>
      </div>

      {/* Features Section */}
      <div style={{
        padding: '4rem 2rem',
        background: 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          <h2 style={{
            textAlign: 'center',
            fontSize: '2.5rem',
            fontWeight: '700',
            color: '#5D4E37',
            marginBottom: '3rem'
          }}>
            Everything You Need to Book Your Tour
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '2rem'
          }}>
            {/* Feature 1 */}
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(93,78,55,0.1)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
              <h3 style={{
                fontSize: '1.4rem',
                fontWeight: '700',
                color: '#5D4E37',
                marginBottom: '1rem'
              }}>
                Smart Venue Discovery
              </h3>
              <p style={{
                color: '#708090',
                lineHeight: '1.6',
                fontSize: '1rem'
              }}>
                Find the perfect venues for your tour using AI-powered search. Discover bars, clubs, and performance spaces that match your genre and audience.
              </p>
            </div>

            {/* Feature 2 */}
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(93,78,55,0.1)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
              <h3 style={{
                fontSize: '1.4rem',
                fontWeight: '700',
                color: '#5D4E37',
                marginBottom: '1rem'
              }}>
                Campaign Management
              </h3>
              <p style={{
                color: '#708090',
                lineHeight: '1.6',
                fontSize: '1rem'
              }}>
                Organize your booking runs by region and timeline. Track which venues you've contacted, who's responded, and manage confirmations all in one place.
              </p>
            </div>

            {/* Feature 3 */}
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(93,78,55,0.1)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✉️</div>
              <h3 style={{
                fontSize: '1.4rem',
                fontWeight: '700',
                color: '#5D4E37',
                marginBottom: '1rem'
              }}>
                Automated Outreach
              </h3>
              <p style={{
                color: '#708090',
                lineHeight: '1.6',
                fontSize: '1rem'
              }}>
                Send personalized booking emails at scale. Save templates, track opens and responses, and never miss a follow-up opportunity.
              </p>
            </div>

            {/* Feature 4 */}
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(93,78,55,0.1)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📅</div>
              <h3 style={{
                fontSize: '1.4rem',
                fontWeight: '700',
                color: '#5D4E37',
                marginBottom: '1rem'
              }}>
                16-Week Planning
              </h3>
              <p style={{
                color: '#708090',
                lineHeight: '1.6',
                fontSize: '1rem'
              }}>
                Plan your entire tour schedule with our visual calendar. See which weeks need attention and optimize your routing for maximum efficiency.
              </p>
            </div>

            {/* Feature 5 */}
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(93,78,55,0.1)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📱</div>
              <h3 style={{
                fontSize: '1.4rem',
                fontWeight: '700',
                color: '#5D4E37',
                marginBottom: '1rem'
              }}>
                Social Media Automation
              </h3>
              <p style={{
                color: '#708090',
                lineHeight: '1.6',
                fontSize: '1rem'
              }}>
                Generate professional social media posts for each confirmed show. AI creates engaging content with hashtags, mentions, and scheduling recommendations.
              </p>
            </div>

            {/* Feature 6 */}
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(93,78,55,0.1)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📈</div>
              <h3 style={{
                fontSize: '1.4rem',
                fontWeight: '700',
                color: '#5D4E37',
                marginBottom: '1rem'
              }}>
                Analytics & Insights
              </h3>
              <p style={{
                color: '#708090',
                lineHeight: '1.6',
                fontSize: '1rem'
              }}>
                Track your booking success rates, response times, and campaign performance. Make data-driven decisions about where to tour next.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div style={{
        padding: '4rem 2rem',
        background: '#5D4E37',
        color: 'white',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{
            fontSize: '2.5rem',
            fontWeight: '700',
            marginBottom: '1.5rem',
            color: 'white'
          }}>
            Built by Musicians, for Musicians
          </h2>
          <p style={{
            fontSize: '1.2rem',
            lineHeight: '1.8',
            color: '#E8DCC4',
            marginBottom: '2rem'
          }}>
            Camel Ranch Booking was created by Better Than Nothin', a country/honky-tonk band touring Arkansas and Missouri. After years of manually tracking venues, sending emails, and managing bookings in spreadsheets, we built the tool we wished existed.
          </p>
          <p style={{
            fontSize: '1rem',
            color: '#C19A6B',
            fontStyle: 'italic'
          }}>
            Currently in private beta. Public signups coming soon.
          </p>
        </div>
      </div>

      {/* Login Modal */}
      {showLogin && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: 'white',
            padding: '3rem',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '450px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{
              fontSize: '2rem',
              fontWeight: '700',
              color: '#5D4E37',
              marginBottom: '0.5rem',
              textAlign: 'center'
            }}>
              Welcome Back
            </h2>
            <p style={{
              textAlign: 'center',
              color: '#708090',
              marginBottom: '2rem'
            }}>
              Sign in to your Camel Ranch account
            </p>
            
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: '#5D4E37',
                  fontWeight: '600',
                  fontSize: '0.95rem'
                }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    border: '2px solid #D3D3D3',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#5D4E37'}
                  onBlur={(e) => e.target.style.borderColor = '#D3D3D3'}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: '#5D4E37',
                  fontWeight: '600',
                  fontSize: '0.95rem'
                }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    border: '2px solid #D3D3D3',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#5D4E37'}
                  onBlur={(e) => e.target.style.borderColor = '#D3D3D3'}
                />
              </div>

              {error && (
                <div style={{
                  padding: '1rem',
                  background: '#FEE',
                  color: '#C33',
                  borderRadius: '6px',
                  marginBottom: '1.5rem',
                  textAlign: 'center',
                  fontSize: '0.95rem',
                  fontWeight: '500'
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogin(false);
                    setError('');
                    setEmail('');
                    setPassword('');
                  }}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    background: 'transparent',
                    color: '#708090',
                    border: '2px solid #D3D3D3',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = '#708090'}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = '#D3D3D3'}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '1rem',
                    background: '#5D4E37',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#4a3f2d'}
                  onMouseOut={(e) => e.currentTarget.style.background = '#5D4E37'}
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

