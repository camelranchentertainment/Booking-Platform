'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      setLoading(true);

      // Sign in with Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      });

      if (authError) throw authError;

      if (!data.user) {
        throw new Error('Login failed');
      }

      // Get band profile
      const { data: profile } = await supabase
        .from('band_profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      // Store in localStorage for backward compatibility
      localStorage.setItem('loggedInUser', JSON.stringify({
        email: data.user.email,
        id: data.user.id,
        bandName: profile?.band_name || 'Unknown Band'
      }));

      // Redirect to dashboard
      window.location.href = '/dashboard';

    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style jsx>{`
        * { box-sizing: border-box; }
        
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
          padding: 2rem;
        }
        
        @media (max-width: 767px) {
          .login-container {
            padding: 1rem;
          }
        }
      `}</style>

      <div className="login-container">
        <div style={{
          background: 'linear-gradient(135deg, rgba(45, 35, 25, 0.95), rgba(61, 40, 23, 0.95))',
          border: '2px solid rgba(200, 168, 130, 0.3)',
          borderRadius: '16px',
          padding: '3rem',
          maxWidth: '450px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
        }}>
          {/* Logo/Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{
              fontSize: '2rem',
              fontWeight: '700',
              color: '#C8A882',
              margin: '0 0 0.5rem 0'
            }}>
              Camel Ranch Booking
            </h1>
            <p style={{ color: '#9B8A7A', margin: 0, fontSize: '1rem' }}>
              Log in to your account
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              background: 'rgba(255, 0, 0, 0.1)',
              border: '2px solid rgba(255, 0, 0, 0.3)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              color: '#ff6b6b',
              fontSize: '0.95rem'
            }}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              {/* Email */}
              <div>
                <label style={{
                  display: 'block',
                  color: '#C8A882',
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  fontSize: '0.95rem'
                }}>
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="band@example.com"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    borderRadius: '8px',
                    border: '2px solid rgba(200, 168, 130, 0.3)',
                    background: 'rgba(0,0,0,0.3)',
                    color: '#E8DCC4',
                    fontSize: '1rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Password */}
              <div>
                <label style={{
                  display: 'block',
                  color: '#C8A882',
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  fontSize: '0.95rem'
                }}>
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder="Enter your password"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    borderRadius: '8px',
                    border: '2px solid rgba(200, 168, 130, 0.3)',
                    background: 'rgba(0,0,0,0.3)',
                    color: '#E8DCC4',
                    fontSize: '1rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Forgot Password */}
            <div style={{ textAlign: 'right', marginTop: '0.75rem' }}>
              <a
                href="/forgot-password"
                style={{
                  color: '#9B8A7A',
                  fontSize: '0.9rem',
                  textDecoration: 'none'
                }}
              >
                Forgot password?
              </a>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '1rem',
                marginTop: '2rem',
                background: loading 
                  ? '#708090' 
                  : 'linear-gradient(135deg, #C8A882 0%, #B8987A 100%)',
                color: loading ? 'white' : '#2d2d2d',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: '700',
                fontSize: '1.05rem',
                boxShadow: '0 4px 12px rgba(200, 168, 130, 0.3)'
              }}
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </form>

          {/* Sign Up Link */}
          <div style={{
            textAlign: 'center',
            marginTop: '1.5rem',
            color: '#9B8A7A',
            fontSize: '0.95rem'
          }}>
            Don't have an account?{' '}
            <a
              href="/signup"
              style={{
                color: '#C8A882',
                textDecoration: 'none',
                fontWeight: '600'
              }}
            >
              Sign Up
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
