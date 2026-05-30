import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { UserProfile } from '../../lib/types';
import Sidebar from './Sidebar';

interface Props {
  children: React.ReactNode;
  requireRole?: 'band_admin' | 'member' | 'superadmin' | ('band_admin' | 'member' | 'superadmin')[] | null;
}

function daysLeft(trialEndsAt: string | null | undefined): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000));
}

function needsSubscription(profile: UserProfile): boolean {
  if (profile.role === 'superadmin' || profile.role === 'member') return false;
  const status = profile.subscription_status;
  if (!status) return false;  // no billing record yet — let them in
  if (status === 'active') return false;
  if (status === 'trialing' && daysLeft(profile.trial_ends_at) > 0) return false;
  return true;
}

type SysNotif = {
  id: string;
  type: string;
  message: string;
  action_url: string | null;
  created_at: string;
};

type InviteNotif = {
  id: string;
  role: string;
  token: string;
  act: { act_name: string } | null;
};

const TYPE_COLOR: Record<string, string> = {
  bulk_send:     '#34d399',
  advance_due:   '#f97316',
  thank_you_due: '#a78bfa',
  follow_up_due: '#fbbf24',
  system:        'var(--accent)',
};
const TYPE_LABEL: Record<string, string> = {
  bulk_send:     'Bulk Send',
  advance_due:   'Advance Due',
  thank_you_due: 'Thank You Due',
  follow_up_due: 'Follow Up',
  system:        'Notice',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotifBell({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [open, setOpen]           = useState(false);
  const [sysNotifs, setSys]       = useState<SysNotif[]>([]);
  const [invites, setInvites]     = useState<InviteNotif[]>([]);
  const [responding, setResponding] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [sysRes, invRes] = await Promise.all([
      supabase
        .from('notifications')
        .select('id, type, message, action_url, created_at')
        .eq('user_id', userId)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(20),
      email
        ? supabase
            .from('act_invitations')
            .select('id, role, token, act:act_id(act_name)')
            .eq('email', email)
            .eq('status', 'pending')
        : Promise.resolve({ data: [] }),
    ]);
    setSys((sysRes.data || []) as SysNotif[]);
    setInvites(((invRes.data || []) as any[]).map(i => ({ ...i, act: i.act as any })));
  }, [userId, email]);

  useEffect(() => { load(); }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const dismiss = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setSys(prev => prev.filter(n => n.id !== id));
  };

  const dismissAll = async () => {
    const ids = sysNotifs.map(n => n.id);
    if (ids.length) await supabase.from('notifications').update({ read: true }).in('id', ids);
    setSys([]);
  };

  const acceptInvite = async (inv: InviteNotif) => {
    setResponding(inv.id);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setResponding(''); return; }
    const { data: prof } = await supabase.from('user_profiles').select('display_name').eq('id', user.id).single();
    await fetch('/api/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inv.token, userId: user.id, displayName: prof?.display_name || '' }),
    });
    setResponding('');
    setOpen(false);
    router.reload();
  };

  const total = sysNotifs.length + invites.length;

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      {/* Bell button — icon only, no box */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
          outline: 'none',
          color: total > 0 ? '#fbbf24' : 'rgba(255,255,255,0.6)',
          cursor: 'pointer',
          padding: '0.2rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.3rem',
          transition: 'color 0.15s',
          lineHeight: 1,
        }}
        aria-label={`Notifications${total > 0 ? ` (${total} unread)` : ''}`}
        title="Notifications"
      >
        🔔
        {total > 0 && (
          <span style={{
            position: 'absolute', top: 3, right: 3,
            background: '#ef4444', color: '#fff',
            borderRadius: '999px', fontSize: '0.55rem', fontWeight: 700,
            minWidth: 14, height: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1,
            boxShadow: '0 0 0 1.5px var(--bg-base)',
          }}>{total}</span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 320, maxHeight: 420, overflowY: 'auto',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          zIndex: 200,
        }}>
          {/* Header */}
          <div style={{
            padding: '0.65rem 1rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Notifications {total > 0 && <span style={{ color: '#fbbf24' }}>({total})</span>}
            </span>
            {sysNotifs.length > 1 && (
              <button
                onClick={dismissAll}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--text-muted)', padding: 0 }}
              >
                Clear all
              </button>
            )}
          </div>

          {total === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              All caught up ✓
            </div>
          ) : (
            <div style={{ padding: '0.5rem' }}>

              {/* System notifications */}
              {sysNotifs.map(n => (
                <div key={n.id} style={{
                  padding: '0.65rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${(TYPE_COLOR[n.type] || 'var(--accent)') + '30'}`,
                  background: 'var(--bg-overlay)',
                  marginBottom: '0.4rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em',
                      textTransform: 'uppercase', color: TYPE_COLOR[n.type] || 'var(--accent)',
                    }}>
                      {TYPE_LABEL[n.type] || n.type}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.45, marginBottom: '0.45rem' }}>
                    {n.message}
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {n.action_url && (
                      <Link
                        href={n.action_url}
                        onClick={() => { dismiss(n.id); setOpen(false); }}
                        className="btn btn-sm btn-primary"
                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', flex: 1, justifyContent: 'center' }}
                      >
                        Open
                      </Link>
                    )}
                    <button
                      onClick={() => dismiss(n.id)}
                      className="btn btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', color: 'var(--text-muted)', background: 'transparent', borderColor: 'var(--border)', flex: n.action_url ? 0 : 1, justifyContent: 'center' }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}

              {/* Band invitations */}
              {invites.map(inv => (
                <div key={inv.id} style={{
                  padding: '0.65rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(167,139,250,0.3)',
                  background: 'var(--bg-overlay)',
                  marginBottom: '0.4rem',
                }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a78bfa', marginBottom: '0.3rem' }}>
                    Band Invite
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.1rem' }}>
                    {inv.act?.act_name || 'A band'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
                    Invited as {inv.role === 'band_admin' ? 'Band Admin' : 'Member'}
                  </div>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={!!responding}
                    onClick={() => acceptInvite(inv)}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.72rem', background: '#a78bfa', borderColor: '#a78bfa', color: '#000' }}
                  >
                    {responding === inv.id ? '…' : 'Accept Invite'}
                  </button>
                </div>
              ))}

            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children, requireRole = null }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [actName, setActName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [authUser, setAuthUser] = useState<{ id: string; email: string } | null>(null);

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

        if (needsSubscription(data as UserProfile) && router.pathname !== '/pricing') {
          router.replace('/pricing?trial=expired');
          return;
        }

        // Onboarding redirect for new band admins — only when column explicitly false
        if (
          data.role === 'band_admin' &&
          (data as any).onboarding_completed === false &&
          router.pathname !== '/onboarding'
        ) {
          router.replace('/onboarding');
          return;
        }

        const allowedRoles = Array.isArray(requireRole) ? requireRole : requireRole ? [requireRole] : null;
        if (data.role !== 'superadmin' && allowedRoles && !allowedRoles.includes(data.role as any)) {
          if (data.role === 'band_admin') router.replace('/band');
          else router.replace('/member');
          return;
        }

        setProfile(data as UserProfile);
        setAuthUser({ id: user.id, email: user.email || '' });

        if ((data.role === 'band_admin' || data.role === 'member') && data.act_id) {
          const { data: act } = await supabase.from('acts').select('act_name').eq('id', data.act_id).maybeSingle();
          if (act?.act_name) setActName(act.act_name);
        } else if (data.role === 'band_admin') {
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
      case 'superadmin': return { label: 'SUPERADMIN', color: '#E07820' };
      case 'band_admin':  return { label: actName ? `BAND ADMIN — ${actName}` : 'BAND ADMIN', color: '#a78bfa' };
      case 'member':     return { label: actName ? `MEMBER — ${actName}` : 'MEMBER', color: '#94a3b8' };
      default:           return null;
    }
  })();

  return (
    <div className="app-shell">
      <button className="mobile-menu-btn" onClick={() => setNavOpen(v => !v)} aria-label="Open menu">
        <span /><span /><span />
      </button>

      {navOpen && <div className="mobile-overlay" onClick={() => setNavOpen(false)} />}

      <Sidebar profile={profile} onSignOut={handleSignOut} open={navOpen} onClose={() => setNavOpen(false)} />
      <main className="main-content">
        {/* Banner strip with logo + bell */}
        <div style={{
          margin: '-2rem -2rem 1.75rem',
          padding: '0.6rem 1.25rem 0.6rem 2rem',
          minHeight: 100,
          background: 'linear-gradient(90deg, rgba(13,27,42,0.98) 0%, rgba(20,42,68,0.92) 40%, rgba(20,42,68,0.92) 60%, rgba(13,27,42,0.98) 100%)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'visible',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(224,120,32,0.06) 50%, transparent 100%)',
            pointerEvents: 'none',
          }} />
          {/* Left spacer to keep logo centred */}
          <div style={{ width: 36, flexShrink: 0 }} />
          <img
            src="/camel-ranch-booking-horizontal.svg"
            alt="Camel Ranch Booking"
            style={{ height: '56px', width: 'auto', minWidth: '200px', maxWidth: '320px', objectFit: 'contain', display: 'block' }}
          />
          {/* Bell — only when logged in */}
          {authUser ? (
            <div style={{ position: 'relative', zIndex: 201 }}>
              <NotifBell userId={authUser.id} email={authUser.email} />
            </div>
          ) : (
            <div style={{ width: 36, flexShrink: 0 }} />
          )}
        </div>

        {roleBadge && (
          <div style={{
            margin: '-1.75rem -2rem 1.5rem',
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
              </span>
            )}
          </div>
        )}
        {trialDays !== null && trialDays <= 7 && (
          <div style={{
            margin: '-1.75rem -2rem 1.5rem',
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
