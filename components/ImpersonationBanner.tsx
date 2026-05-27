import { useEffect, useState } from 'react';

export default function ImpersonationBanner() {
  const [actName, setActName] = useState<string | null>(null);

  useEffect(() => {
    const val = localStorage.getItem('crb_impersonating');
    if (val) {
      try {
        const parsed = JSON.parse(val);
        setActName(parsed.act_name || val);
      } catch {
        setActName(val);
      }
    }
  }, []);

  if (!actName) return null;

  const exit = () => {
    localStorage.removeItem('crb_impersonating');
    window.location.reload();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#E8A020', color: '#0E1628',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '1rem', padding: '0.5rem 1rem',
      fontFamily: 'var(--font-body)', fontSize: '0.84rem', fontWeight: 600,
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      <span>⚠️ Superadmin view — viewing as <strong>{actName}</strong></span>
      <button
        onClick={exit}
        style={{
          background: '#0E1628', color: '#E8A020', border: 'none',
          borderRadius: 4, padding: '0.2rem 0.65rem',
          fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Exit
      </button>
    </div>
  );
}
