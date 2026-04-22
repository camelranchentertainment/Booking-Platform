import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { UserProfile } from '../../lib/types';
import Sidebar from './Sidebar';

interface Props {
  children: React.ReactNode;
  requireRole?: 'agent' | 'act_admin' | 'member' | ('agent' | 'act_admin' | 'member')[] | null;
}

function daysLeft(trialEndsAt: string | null | undefined): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000));
}

function needsSubscription(profile: UserProfile): boolean {
  if (profile.role === 'superadmin' || profile.role === 'member') return false;
  const status = profile.subscription_status;
  if (status === 'active') return false;
  if (status === 'trialing' && daysLeft(profile.trial_ends_at) > 0) return false;
  return true;
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

        // Subscription gate — redirect paid tiers with expired/no subscription
        if (needsSubscription(data as UserProfile) && router.pathname !== '/pricing') {
          router.replace('/pricing?trial=expired');
          return;
        }

        // Role gate — superadmin bypasses
        const allowedRoles = Array.isArray(requireRole) ? requireRole : requireRole ? [requireRole] : null;
        if (data.role !== 'superadmin' && allowedRoles && !allowedRoles.includes(data.role as any)) {
          if (data.role === 'agent') router.replace('/dashboard');
          else if (data.role === 'act_admin') router.replace('/band');
          else router.replace('/member');
          return;
        }

        setProfile(data as UserProfile);
        setLoading(false);
      } catch {
        router.replace('/login');
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const trialDays = profile?.subscription_status === 'trialing'
    ? daysLeft(profile?.trial_ends_at)
    : null;

  return (
    <div className="app-shell">
      <Sidebar profile={profile} onSignOut={handleSignOut} />
      <main className="main-content">
        {/* Trial banner */}
        {trialDays !== null && trialDays <= 7 && (
          <div style={{
            margin: '-1.5rem -1.5rem 1.5rem',
            padding: '0.6rem 1.5rem',
            background: trialDays <= 3 ? 'rgba(248,113,113,0.08)' : 'rgba(251,191,36,0.07)',
            borderBottom: `1px solid ${trialDays <= 3 ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.2)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: trialDays <= 3 ? '#f87171' : '#fbbf24' }}>
              {trialDays === 0
                ? '⚠ Your trial ends today'
                : `⚠ ${trialDays} day${trialDays === 1 ? '' : 's'} left in your free trial`}
            </span>
            <button
              className="btn btn-primary"
              style={{ fontSize: '0.72rem', padding: '0.3rem 0.85rem' }}
              onClick={() => router.push('/pricing')}
            >
              Subscribe Now
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
