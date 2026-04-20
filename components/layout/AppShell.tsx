import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { UserProfile } from '../../lib/types';
import Sidebar from './Sidebar';

interface Props {
  children: React.ReactNode;
  requireRole?: 'agent' | 'act_admin' | 'member' | null;
}

export default function AppShell({ children, requireRole = null }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace('/login'); return; }

        const { data } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (!data) { router.replace('/login'); return; }

        // Superadmin bypasses all role gates
        if (data.role !== 'superadmin' && requireRole && data.role !== requireRole) {
          if (data.role === 'agent') router.replace('/dashboard');
          else if (data.role === 'act_admin') router.replace('/band');
          else router.replace('/member');
          return;
        }

        setProfile(data as UserProfile);
      } catch {
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [requireRole]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-base)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar profile={profile} onSignOut={handleSignOut} />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
