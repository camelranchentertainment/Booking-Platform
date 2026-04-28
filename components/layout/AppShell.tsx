import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { UserProfile } from '../../lib/types';
import Sidebar from './Sidebar';

interface Props {
  children: React.ReactNode;
  requireRole?: 'agent' | 'act_admin' | 'member' | 'superadmin' | ('agent' | 'act_admin' | 'member' | 'superadmin')[] | null;
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
  const [actName, setActName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [impersonating, setImpersonating] = useState<{ id: string; name: string; role: string } | null>(null);

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

        // Impersonation state
        try {
          const imp = localStorage.getItem('impersonate_user');
          if (imp) setImpersonating(JSON.parse(imp));
        } catch {}

        // Fetch act name for band admin / member context badge
        if ((data.role === 'act_admin' || data.role === 'member') && data.act_id) {
          const { data: act } = await supabase.from('acts').select('act_name').eq('id', data.act_id).maybeSingle();
          if (act?.act_name) setActName(act.act_name);
        } else if (data.role === 'act_admin') {
          const { data: ownedAct } = await supabase.from('acts').select('act_name').eq('owner_id', user.id).limit(1).maybeSingle();
          if (ownedAct?.act_name) setActName(ownedAct.act_name);
        }

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
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.85rem', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Loading...
        </div>
      </div>
    );
  }

  const trialDays = profile?.subscription_status === 'trialing'
    ? daysLeft(profile?.trial_ends_at)
    : null;

  const roleBadge = (() => {
    if (!profile) return null;
    switch (profile.role) {
      case 'superadmin': return { label: 'SUPERADMIN', color: '#C8921A' };
      case 'agent':      return { label: 'AGENT', color: '#60a5fa' };
      case 'act_admin':  return { label: actName ? `BAND ADMIN — ${actName}` : 'BAND ADMIN', color: '#a78bfa' };
      case 'member':     return { label: actName ? `MEMBER — ${actName}` : 'MEMBER', color: '#94a3b8' };
      default:           return null;
    }
  })();

  return (
    <div className="app-shell">
      {/* Mobile hamburger */}
      <button className="mobile-menu-btn" onClick={() => setNavOpen(v => !v)} aria-label="Open menu">
        <span /><span /><span />
      </button>

      {/* Tap-outside overlay */}
      {navOpen && <div className="mobile-overlay" onClick={() => setNavOpen(false)} />}

      <Sidebar profile={profile} onSignOut={handleSignOut} open={navOpen} onClose={() => setNavOpen(false)} />
      <main className="main-content">
        {/* Role context badge */}
        {roleBadge && (
          <div style={{
            margin: '-2rem -2rem 1.5rem',
            padding: '0.38rem 1.5rem',
            background: 'rgba(0,0,0,0.22)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '0.65rem',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: roleBadge.color,
              background: `${roleBadge.color}18`,
              padding: '0.18rem 0.5rem',
              border: `1px solid ${roleBadge.color}40`,
            }}>
              {roleBadge.label}
            </span>
            {profile?.display_name && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {profile.display_name}
                {profile.role === 'agent' && profile.agency_name ? ` · ${profile.agency_name}` : ''}
              </span>
            )}
          </div>
        )}
        {/* Impersonation banner */}
        {impersonating && (
          <div style={{
            margin: '-2rem -2rem 1.5rem',
            padding: '0.5rem 1.5rem',
            background: '#7c3aed',
            borderBottom: '1px solid #6d28d9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', color: '#fff' }}>
              VIEWING AS {impersonating.name?.toUpperCase() || impersonating.id} [{impersonating.role.toUpperCase()}]
            </span>
            <button
              className="btn btn-sm"
              style={{ fontSize: '0.72rem', padding: '0.25rem 0.75rem', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', cursor: 'pointer' }}
              onClick={() => {
                localStorage.removeItem('impersonate_user');
                setImpersonating(null);
                router.push('/admin');
              }}
            >
              Exit to Admin
            </button>
          </div>
        )}
        {/* Trial banner */}
        {trialDays !== null && trialDays <= 7 && (
          <div style={{
            margin: '-2rem -2rem 1.5rem',
            padding: '0.6rem 2rem',
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
