'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function SignUp() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    bandName: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!formData.bandName.trim()) {
      setError('Band name is required');
      return;
    }

    try {
      setLoading(true);

      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Failed to create user');
      }

      // 2. Create band profile
      const { error: profileError } = await supabase
        .from('band_profiles')
        .insert({
          id: authData.user.id,
          band_name: formData.bandName.trim(),
          username: formData.bandName.toLowerCase().replace(/[^a-z0-9]/g, '')
        });

      if (profileError) throw profileError;

      // Success! Redirect to login
      alert('✅ Account created! Please check your email to verify your account, then log in.');
      window.location.href = '/login';

    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style jsx>{`
        * { box-sizing: border-box; }
        
        .signup-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
          padding: 2rem;
        }
        
        @media (max-width: 767px) {
          .signup-container {
            padding: 1rem;
          }
        }
      `}</style>

      <div className="signup-container">
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
              Create your band account
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
              {/* Band Name */}
              <div>
                <label style={{
                  display: 'block',
                  color: '#C8A882',
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  fontSize: '0.95rem'
                }}>
                  Band Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.bandName}
                  onChange={(e) => setFormData({...formData, bandName: e.target.value})}
                  placeholder="e.g., Jake Stringer & Better Than Nothin'"
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
                  placeholder="At least 6 characters"
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

              {/* Confirm Password */}
              <div>
                <label style={{
                  display: 'block',
                  color: '#C8A882',
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  fontSize: '0.95rem'
                }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                  placeholder="Re-enter password"
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
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          {/* Login Link */}
          <div style={{
            textAlign: 'center',
            marginTop: '1.5rem',
            color: '#9B8A7A',
            fontSize: '0.95rem'
          }}>
            Already have an account?{' '}
            <a
              href="/login"
              style={{
                color: '#C8A882',
                textDecoration: 'none',
                fontWeight: '600'
              }}
            >
              Log In
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
