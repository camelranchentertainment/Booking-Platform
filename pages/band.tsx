import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import BandDashboard from '../components/BandDashboard';

export default function BandPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [email,  setEmail]  = useState('');

  useEffect(() => {
    (async () => {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const local = localStorage.getItem('loggedInUser');
        if (!local) { router.push('/'); return; }
        const localUser = JSON.parse(local);
        if (localUser.token && localUser.refreshToken) {
          const { data: restored } = await supabase.auth.setSession({
            access_token: localUser.token, refresh_token: localUser.refreshToken,
          });
          session = restored.session;
        }
        if (!session) { router.push('/'); return; }
      }
      setUserId(session.user.id);
      setEmail(session.user.email ?? '');
    })();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('loggedInUser');
    router.push('/');
  };

  if (!userId) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#030d18', color: '#7aa5c4', fontFamily: "'Nunito', sans-serif" }}>
      Loading…
    </div>
  );

  return (
    <>
      <Head>
        <title>Band Dashboard — Camel Ranch Booking</title>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #030d18; font-family: 'Nunito', sans-serif; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #030d18; } ::-webkit-scrollbar-thumb { background: rgba(74,133,200,0.2); border-radius: 3px; }
      `}</style>
      <div style={{ minHeight: '100vh', background: '#030d18', color: '#e8f1f8' }}>
        {/* Header */}
        <header style={{ background: 'rgba(3,13,24,0.97)', borderBottom: '1px solid rgba(74,133,200,0.12)', position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(16px)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 2rem', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: '#e8f1f8' }}>C</div>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '1.3rem', letterSpacing: '0.07em', color: '#e8f1f8' }}>Camel Ranch Booking</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#4a7a9b', fontSize: 13 }}>{email}</span>
              <button onClick={handleLogout} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 7, color: '#7aa5c4', fontSize: 13, cursor: 'pointer' }}>Sign Out</button>
            </div>
          </div>
        </header>

        <BandDashboard userId={userId} />
      </div>
    </>
  );
}
