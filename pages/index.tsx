'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function LandingPage() {
  const router = useRouter();
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword
      });

      if (error) throw error;

      localStorage.setItem('loggedInUser', JSON.stringify(data.user));
      router.push('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed. Please check your credentials.');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: {
            name: signupName
          }
        }
      });

      if (error) throw error;

      alert('Account created! Please check your email to verify your account.');
      setShowSignup(false);
      setShowLogin(true);
    } catch (error) {
      console.error('Signup error:', error);
      alert('Signup failed. Please try again.');
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #2C1810 0%, #3D2817 50%, #2C1810 100%)',
      minHeight: '100vh',
      color: '#E8DCC4'
    }}>
      {/* Hero Section */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '4rem 2rem'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h1 style={{
            fontSize: '3.5rem',
            fontWeight: '800',
            color: '#C8A882',
            marginBottom: '1rem',
            textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
          }}>
            🎸 Camel Ranch Booking
          </h1>
          <p style={{
            fontSize: '1.5rem',
            color: '#9B8A7A',
            maxWidth: '700px',
            margin: '0 auto'
          }}>
            The complete booking platform for touring musicians and bands
          </p>
        </div>

        {/* Login/Signup Tiles */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '2rem',
          marginBottom: '6rem',
          maxWidth: '800px',
          margin: '0 auto 6rem'
        }}>
          {/* Login Tile */}
          <div
            onClick={() => setShowLogin(true)}
            style={{
              background: 'linear-gradient(135deg, rgba(61, 40, 23, 0.9), rgba(74, 50, 32, 0.9))',
              border: '3px solid #5C4A3A',
              borderRadius: '16px',
              padding: '3rem 2rem',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              textAlign: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-5px)';
              e.currentTarget.style.borderColor = '#C8A882';
              e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#5C4A3A';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
            <h2 style={{ color: '#C8A882', fontSize: '1.8rem', marginBottom: '0.5rem' }}>Member Login</h2>
            <p style={{ color: '#9B8A7A' }}>Access your booking dashboard</p>
          </div>

          {/* Signup Tile */}
          <div
            onClick={() => setShowSignup(true)}
            style={{
              background: 'linear-gradient(135deg, rgba(135, 174, 115, 0.2), rgba(107, 142, 92, 0.2))',
              border: '3px solid #87AE73',
              borderRadius: '16px',
              padding: '3rem 2rem',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              textAlign: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-5px)';
              e.currentTarget.style.borderColor = '#C8A882';
              e.currentTarget.style.boxShadow = '0 10px 30px rgba(135, 174, 115, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#87AE73';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✨</div>
            <h2 style={{ color: '#87AE73', fontSize: '1.8rem', marginBottom: '0.5rem' }}>Sign Up Free</h2>
            <p style={{ color: '#9B8A7A' }}>Start booking venues today</p>
          </div>
        </div>

        {/* Benefits Section */}
        <div style={{ marginBottom: '6rem' }}>
          <h2 style={{
            textAlign: 'center',
            fontSize: '2.5rem',
            color: '#C8A882',
            marginBottom: '3rem'
          }}>
            Why Choose Camel Ranch Booking?
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '2rem'
          }}>
            {[
              {
                icon: '🗺️',
                title: 'Smart Venue Discovery',
                desc: 'Automatically find live music venues in your tour cities with Google Places integration'
              },
              {
                icon: '📧',
                title: 'Campaign Management',
                desc: 'Organize venues by tour, track contact status, and manage multiple campaigns simultaneously'
              },
              {
                icon: '📊',
                title: 'Booking Dashboard',
                desc: 'Real-time tracking of contacted venues, pending responses, and confirmed bookings'
              },
              {
                icon: '🎯',
                title: 'Targeted Outreach',
                desc: 'Filter venues by city, state, and type. Send personalized booking emails efficiently'
              },
              {
                icon: '💾',
                title: 'Centralized Database',
                desc: 'Build and maintain your own venue database with contact info, notes, and history'
              },
              {
                icon: '🚀',
                title: 'Time Savings',
                desc: 'Cut booking coordination time by 70%. Spend more time on music, less on logistics'
              }
            ].map((benefit, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(61, 40, 23, 0.5)',
                  border: '2px solid #5C4A3A',
                  borderRadius: '12px',
                  padding: '2rem',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{benefit.icon}</div>
                <h3 style={{ color: '#C8A882', fontSize: '1.3rem', marginBottom: '0.75rem' }}>
                  {benefit.title}
                </h3>
                <p style={{ color: '#9B8A7A', lineHeight: '1.6' }}>
                  {benefit.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Features Section */}
        <div style={{ marginBottom: '6rem' }}>
          <h2 style={{
            textAlign: 'center',
            fontSize: '2.5rem',
            color: '#C8A882',
            marginBottom: '3rem'
          }}>
            Platform Features
          </h2>

          <div style={{
            background: 'rgba(61, 40, 23, 0.6)',
            border: '2px solid #5C4A3A',
            borderRadius: '12px',
            padding: '3rem',
            maxWidth: '900px',
            margin: '0 auto'
          }}>
            {[
              'Multi-city tour planning with customizable search radius',
              'Automated venue discovery via Google Places API',
              'Contact status tracking (Contact?, Pending, Declined, Booked)',
              'Email integration for venue outreach',
              'Venue database with full contact details and notes',
              'Campaign-based organization for different tours',
              'Real-time dashboard with booking statistics',
              'Mobile-responsive design for on-the-go access'
            ].map((feature, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '1rem 0',
                  borderBottom: i < 7 ? '1px solid #5C4A3A' : 'none'
                }}
              >
                <span style={{ color: '#87AE73', fontSize: '1.5rem', marginRight: '1rem' }}>✓</span>
                <span style={{ color: '#E8DCC4', fontSize: '1.1rem' }}>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing Section */}
        <div style={{ marginBottom: '6rem' }}>
          <h2 style={{
            textAlign: 'center',
            fontSize: '2.5rem',
            color: '#C8A882',
            marginBottom: '3rem'
          }}>
            Simple, Transparent Pricing
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '2rem',
            maxWidth: '1000px',
            margin: '0 auto'
          }}>
            {/* Free Tier */}
            <div style={{
              background: 'rgba(61, 40, 23, 0.6)',
              border: '2px solid #5C4A3A',
              borderRadius: '12px',
              padding: '2.5rem',
              textAlign: 'center'
            }}>
              <h3 style={{ color: '#9B8A7A', fontSize: '1.5rem', marginBottom: '1rem' }}>Free</h3>
              <div style={{ fontSize: '3rem', fontWeight: '800', color: '#C8A882', marginBottom: '1rem' }}>
                $0
                <span style={{ fontSize: '1rem', fontWeight: '400', color: '#9B8A7A' }}>/month</span>
              </div>
              <ul style={{
                listStyle: 'none',
                padding: 0,
                textAlign: 'left',
                color: '#E8DCC4',
                lineHeight: '2'
              }}>
                <li>✓ Up to 50 venues</li>
                <li>✓ 1 active campaign</li>
                <li>✓ Basic venue discovery</li>
                <li>✓ Contact tracking</li>
              </ul>
              <button
                onClick={() => setShowSignup(true)}
                style={{
                  marginTop: '2rem',
                  width: '100%',
                  padding: '1rem',
                  background: '#708090',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Start Free
              </button>
            </div>

            {/* Pro Tier */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(135, 174, 115, 0.3), rgba(107, 142, 92, 0.3))',
              border: '3px solid #87AE73',
              borderRadius: '12px',
              padding: '2.5rem',
              textAlign: 'center',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: '-15px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#87AE73',
                color: 'white',
                padding: '0.5rem 1.5rem',
                borderRadius: '20px',
                fontSize: '0.85rem',
                fontWeight: '700'
              }}>
                POPULAR
              </div>
              <h3 style={{ color: '#87AE73', fontSize: '1.5rem', marginBottom: '1rem' }}>Pro</h3>
              <div style={{ fontSize: '3rem', fontWeight: '800', color: '#C8A882', marginBottom: '1rem' }}>
                $29
                <span style={{ fontSize: '1rem', fontWeight: '400', color: '#9B8A7A' }}>/month</span>
              </div>
              <ul style={{
                listStyle: 'none',
                padding: 0,
                textAlign: 'left',
                color: '#E8DCC4',
                lineHeight: '2'
              }}>
                <li>✓ Unlimited venues</li>
                <li>✓ Unlimited campaigns</li>
                <li>✓ Advanced discovery</li>
                <li>✓ Email automation</li>
                <li>✓ Priority support</li>
                <li>✓ Export to CSV</li>
              </ul>
              <button
                onClick={() => setShowSignup(true)}
                style={{
                  marginTop: '2rem',
                  width: '100%',
                  padding: '1rem',
                  background: '#87AE73',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Start Pro Trial
              </button>
            </div>

            {/* Enterprise Tier */}
            <div style={{
              background: 'rgba(61, 40, 23, 0.6)',
              border: '2px solid #5C4A3A',
              borderRadius: '12px',
              padding: '2.5rem',
              textAlign: 'center'
            }}>
              <h3 style={{ color: '#9B8A7A', fontSize: '1.5rem', marginBottom: '1rem' }}>Enterprise</h3>
              <div style={{ fontSize: '3rem', fontWeight: '800', color: '#C8A882', marginBottom: '1rem' }}>
                Custom
              </div>
              <ul style={{
                listStyle: 'none',
                padding: 0,
                textAlign: 'left',
                color: '#E8DCC4',
                lineHeight: '2'
              }}>
                <li>✓ Everything in Pro</li>
                <li>✓ Team collaboration</li>
                <li>✓ Custom integrations</li>
                <li>✓ Dedicated support</li>
                <li>✓ White-label option</li>
              </ul>
              <button
                style={{
                  marginTop: '2rem',
                  width: '100%',
                  padding: '1rem',
                  background: 'transparent',
                  color: '#C8A882',
                  border: '2px solid #C8A882',
                  borderRadius: '8px',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Contact Sales
              </button>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div style={{
          textAlign: 'center',
          background: 'rgba(135, 174, 115, 0.2)',
          border: '2px solid #87AE73',
          borderRadius: '16px',
          padding: '4rem 2rem',
          marginBottom: '4rem'
        }}>
          <h2 style={{ fontSize: '2.5rem', color: '#C8A882', marginBottom: '1rem' }}>
            Ready to streamline your booking workflow?
          </h2>
          <p style={{ fontSize: '1.2rem', color: '#9B8A7A', marginBottom: '2rem' }}>
            Join touring musicians who are saving hours on venue coordination
          </p>
          <button
            onClick={() => setShowSignup(true)}
            style={{
              padding: '1.25rem 3rem',
              background: '#87AE73',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1.3rem',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(135, 174, 115, 0.4)'
            }}
          >
            Get Started Free →
          </button>
        </div>
      </div>

      {/* Login Modal */}
      {showLogin && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '2rem'
          }}
          onClick={() => setShowLogin(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #3D2817, #4A3220)',
              border: '3px solid #8B6F47',
              borderRadius: '15px',
              padding: '3rem',
              maxWidth: '450px',
              width: '100%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#C8A882', marginBottom: '2rem', fontSize: '2rem' }}>Member Login</h2>
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: '#C8A882', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #5C4A3A',
                    borderRadius: '6px',
                    background: 'rgba(245, 245, 240, 0.1)',
                    color: '#E8DCC4',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', color: '#C8A882', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #5C4A3A',
                    borderRadius: '6px',
                    background: 'rgba(245, 245, 240, 0.1)',
                    color: '#E8DCC4',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowLogin(false)}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    background: 'transparent',
                    border: '2px solid #708090',
                    color: '#708090',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '1rem',
                    background: '#87AE73',
                    border: 'none',
                    color: 'white',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Login
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Signup Modal */}
      {showSignup && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '2rem'
          }}
          onClick={() => setShowSignup(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #3D2817, #4A3220)',
              border: '3px solid #8B6F47',
              borderRadius: '15px',
              padding: '3rem',
              maxWidth: '450px',
              width: '100%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#C8A882', marginBottom: '2rem', fontSize: '2rem' }}>Create Account</h2>
            <form onSubmit={handleSignup}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: '#C8A882', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Name
                </label>
                <input
                  type="text"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #5C4A3A',
                    borderRadius: '6px',
                    background: 'rgba(245, 245, 240, 0.1)',
                    color: '#E8DCC4',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: '#C8A882', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #5C4A3A',
                    borderRadius: '6px',
                    background: 'rgba(245, 245, 240, 0.1)',
                    color: '#E8DCC4',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', color: '#C8A882', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #5C4A3A',
                    borderRadius: '6px',
                    background: 'rgba(245, 245, 240, 0.1)',
                    color: '#E8DCC4',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowSignup(false)}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    background: 'transparent',
                    border: '2px solid #708090',
                    color: '#708090',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '1rem',
                    background: '#87AE73',
                    border: 'none',
                    color: 'white',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Sign Up
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
