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
      {/* Nav */}
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
            cursor: 'pointer'
          }}
        >
          Login
        </button>
      </nav>

      {/* Hero */}
      <div style={{
        padding: '4rem 2rem',
        textAlign: 'center',
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        <h1 style={{
          fontSize: '3rem',
          fontWeight: '800',
          color: '#5D4E37',
          marginBottom: '1.5rem'
        }}>
          Book Your Next Tour with Confidence
        </h1>
        <p style={{ fontSize: '1.25rem', color: '#708090', marginBottom: '2rem' }}>
          Professional venue management for Better Than Nothin
        </p>
        <button
          onClick={() => setShowLogin(true)}
          style={{
            padding: '1rem 2rem',
            background: '#5D4E37',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '1.1rem',
            cursor: 'pointer'
          }}
        >
          Sign In
        </button>
      </div>

      {/* Login Modal */}
      {showLogin && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
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
            maxWidth: '400px'
          }}>
            <h2 style={{ marginBottom: '2rem', color: '#5D4E37' }}>Welcome Back</h2>
            
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#5D4E37', fontWeight: '600' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #D3D3D3',
                    borderRadius: '6px',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#5D4E37', fontWeight: '600' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #D3D3D3',
                    borderRadius: '6px',
                    fontSize: '1rem'
                  }}
                />
              </div>

              {error && (
                <div style={{
                  padding: '0.75rem',
                  background: '#FEE',
                  color: '#C33',
                  borderRadius: '6px',
                  marginBottom: '1.5rem',
                  textAlign: 'center'
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
                  }}
                  style={{
                    flex: 1,
                    padding: '0.875rem',
                    background: '#D3D3D3',
                    border: 'none',
                    borderRadius: '6px',
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
                    padding: '0.875rem',
                    background: '#5D4E37',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
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
    </div>
  );
}
