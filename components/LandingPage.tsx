'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Hardcoded credentials for Jake and Scott
    const validUsers: { [key: string]: string } = {
      'jake@camelranchbooking.com': 'Tornado2023!',
      'scott@camelranchbooking.com': 'Tornado2023!'
    };

    if (validUsers[username.toLowerCase()] === password) {
      // Store auth in localStorage
      localStorage.setItem('authenticated', 'true');
      localStorage.setItem('username', username);
      router.push('/dashboard');
    } else {
      setError('Invalid credentials');
    }
  };

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Faded Background Image */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'url(https://images.unsplash.com/photo-1516490701797-30b8dc35e096?q=80&w=2000)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: 0.15,
        zIndex: 0
      }} />

      {/* Overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, #F5F5F0 0%, rgba(245,245,240,0.95) 100%)',
        zIndex: 1
      }} />

      {/* Content */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Navigation */}
        <nav style={{
          padding: '1.5rem 3rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{
            fontSize: '1.75rem',
            fontWeight: '700',
            color: '#5D4E37',
            letterSpacing: '-0.02em'
          }}>
            Camel Ranch Booking
          </div>
          <button
            onClick={() => setShowLogin(true)}
            style={{
              padding: '0.75rem 1.75rem',
              background: '#5D4E37',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.95rem',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#4a3f2d'}
            onMouseOut={(e) => e.currentTarget.style.background = '#5D4E37'}
          >
            Login
          </button>
        </nav>

        {/* Hero Section */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <div style={{ maxWidth: '800px' }}>
            <h1 style={{
              fontSize: '3.5rem',
              fontWeight: '800',
              color: '#5D4E37',
              marginBottom: '1.5rem',
              lineHeight: '1.1',
              letterSpacing: '-0.02em'
            }}>
              Book Your Next Tour with Confidence
            </h1>
            <p style={{
              fontSize: '1.25rem',
              color: '#708090',
              marginBottom: '3rem',
              lineHeight: '1.6'
            }}>
              Streamline venue discovery, manage booking campaigns, and track your outreach—all in one powerful platform built for touring musicians.
            </p>

            {/* CTA Buttons */}
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <button
                disabled
                style={{
                  padding: '1rem 2.5rem',
                  background: '#D3D3D3',
                  color: '#A8A8A8',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '1.05rem',
                  cursor: 'not-allowed',
                  opacity: 0.6
                }}
              >
                Create Account
                <span style={{
                  marginLeft: '0.5rem',
                  fontSize: '0.85rem',
                  fontWeight: '400'
                }}>
                  (Coming Soon)
                </span>
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
                  fontSize: '1.05rem',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
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
                Sign In
              </button>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div style={{
          padding: '4rem 3rem',
          background: 'rgba(255, 255, 255, 0.5)',
          borderTop: '1px solid #D3D3D3'
        }}>
          <div style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '2rem'
          }}>
            {/* Feature 1 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '2.5rem',
                marginBottom: '1rem'
              }}>🎯</div>
              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: '700',
                color: '#5D4E37',
                marginBottom: '0.75rem'
              }}>
                Smart Venue Discovery
              </h3>
              <p style={{
                color: '#708090',
                lineHeight: '1.6'
              }}>
                Find the perfect venues for your tour using AI-powered search and detailed venue profiles.
              </p>
            </div>

            {/* Feature 2 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '2.5rem',
                marginBottom: '1rem'
              }}>📊</div>
              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: '700',
                color: '#5D4E37',
                marginBottom: '0.75rem'
              }}>
                Campaign Management
              </h3>
              <p style={{
                color: '#708090',
                lineHeight: '1.6'
              }}>
                Organize your booking runs, track outreach, and manage confirmations all in one place.
              </p>
            </div>

            {/* Feature 3 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '2.5rem',
                marginBottom: '1rem'
              }}>✉️</div>
              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: '700',
                color: '#5D4E37',
                marginBottom: '0.75rem'
              }}>
                Automated Outreach
              </h3>
              <p style={{
                color: '#708090',
                lineHeight: '1.6'
              }}>
                Send personalized booking emails and track responses without the hassle.
              </p>
            </div>
          </div>
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
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '3rem',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '400px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }}>
            <h2 style={{
              fontSize: '1.75rem',
              fontWeight: '700',
              color: '#5D4E37',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              Welcome Back
            </h2>
            
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  color: '#5D4E37',
                  fontWeight: '600',
                  marginBottom: '0.5rem',
                  fontSize: '0.9rem'
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
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
                  color: '#5D4E37',
                  fontWeight: '600',
                  marginBottom: '0.5rem',
                  fontSize: '0.9rem'
                }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
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
                  padding: '0.75rem',
                  background: '#FEE',
                  color: '#C33',
                  borderRadius: '6px',
                  marginBottom: '1.5rem',
                  fontSize: '0.9rem',
                  textAlign: 'center'
                }}>
                  {error}
                </div>
              )}

              <div style={{
                display: 'flex',
                gap: '1rem'
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogin(false);
                    setError('');
                    setUsername('');
                    setPassword('');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.875rem',
                    background: 'transparent',
                    color: '#708090',
                    border: '2px solid #D3D3D3',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
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
                    padding: '0.875rem',
                    background: '#5D4E37',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
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
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
