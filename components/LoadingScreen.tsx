import { useEffect, useState } from 'react';

export function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, []);

  if (timedOut) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0E1628',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '1rem',
      }}>
        <p style={{ color: '#E8602A', fontFamily: 'sans-serif', margin: 0, fontSize: '1rem' }}>
          Failed to load. Please refresh.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#C8921A', color: '#fff', border: 'none',
            borderRadius: '6px', padding: '8px 20px', cursor: 'pointer',
            fontFamily: 'sans-serif', fontSize: '0.9rem',
          }}
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0E1628',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: '1rem',
    }}>
      <div style={{
        width: '40px', height: '40px',
        border: '3px solid rgba(255,255,255,0.1)',
        borderTopColor: '#E8602A',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: '#6B8FB5', fontFamily: 'sans-serif', margin: 0 }}>{message}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
