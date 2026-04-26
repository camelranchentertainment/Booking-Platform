import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { UserProfile } from '../../lib/types';
import { supabase } from '../../lib/supabase';

interface Props {
  profile: UserProfile | null;
  onSignOut: () => void;
  open?: boolean;
  onClose?: () => void;
}

type Notif =
  | { type: 'agent_link'; id: string; permissions: string; message: string | null; agent: { display_name: string | null; agency_name: string | null; email: string } }
  | { type: 'act_invitation'; id: string; role: string; token: string; act: { act_name: string } | null };

type SysNotif = {
  id: string;
  type: string;
  message: string;
  action_url: string | null;
  created_at: string;
};

const agentNav = [
  { label: 'Dashboard',  href: '/dashboard',  icon: '◈' },
  { label: 'Today',      href: '/today',      icon: '◉' },
  { label: 'Bands',      href: '/acts',       icon: '♪' },
  { label: 'Tours',      href: '/tours',      icon: '⟴' },
  { label: 'Venues',     href: '/venues',     icon: '⌂' },
  { label: 'Calendar',   href: '/calendar',   icon: '◷' },
  { label: 'Email',      href: '/email',      icon: '✉' },
  { label: 'Social',     href: '/social',     icon: '✦' },
  { label: 'Financials', href: '/financials', icon: '$' },
  { label: 'Settings',   href: '/settings',   icon: '⚙' },
];

const bandNav = [
  { label: 'Dashboard', href: '/band',          icon: '◈' },
  { label: 'Today',     href: '/today',         icon: '◉' },
  { label: 'Members',   href: '/band/members',  icon: '♟' },
  { label: 'Tours',     href: '/band/tours',    icon: '⟴' },
  { label: 'Venues',    href: '/venues',        icon: '⌂' },
  { label: 'Calendar',  href: '/band/calendar', icon: '◷' },
  { label: 'Email',     href: '/band/email',    icon: '✉' },
  { label: 'Social',    href: '/band/social',   icon: '✦' },
  { label: 'Account',   href: '/band/settings', icon: '⚙' },
];

const memberNav = [
  { label: 'Dashboard', href: '/member',          icon: '◈' },
  { label: 'Today',     href: '/today',           icon: '◉' },
  { label: 'Calendar',  href: '/member/calendar', icon: '◷' },
  { label: 'Account',   href: '/settings',        icon: '⚙' },
];

const portals = [
  { label: 'Agent View',       href: '/dashboard', color: 'var(--accent)' },
  { label: 'Band Admin View',  href: '/band',      color: '#a78bfa' },
  { label: 'Member View',      href: '/member',    color: '#34d399' },
];

export default function Sidebar({ profile, onSignOut, open, onClose }: Props) {
  const router = useRouter();
  const isSuperAdmin = profile?.role === 'superadmin';
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [notifs, setNotifs]         = useState<Notif[]>([]);
  const [sysNotifs, setSysNotifs]   = useState<SysNotif[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [responding, setResponding] = useState('');
  const [actName, setActName]       = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (saved) setTheme(saved);
  }, []);

  const loadNotifs = useCallback(async () => {
    if (!profile) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const collected: Notif[] = [];

    // Agent link requests pending for this band admin's act
    if (profile.role === 'act_admin' || isSuperAdmin) {
      let actId: string | null = null;
      const { data: acts } = await supabase.from('acts').select('id, act_name').eq('owner_id', user.id).eq('is_active', true).limit(1);
      if (acts?.length) {
        actId = acts[0].id;
        setActName((acts[0] as any).act_name || null);
      } else {
        const { data: prof } = await supabase.from('user_profiles').select('act_id').eq('id', user.id).single();
        actId = prof?.act_id || null;
        if (actId) {
          const { data: linkedAct } = await supabase.from('acts').select('act_name').eq('id', actId).maybeSingle();
          setActName((linkedAct as any)?.act_name || null);
        }
      }
      if (actId) {
        const { data: links } = await supabase
          .from('agent_act_links')
          .select('id, permissions, message, agent:agent_id(display_name, agency_name, email)')
          .eq('act_id', actId)
          .eq('status', 'pending');
        (links || []).forEach(l => collected.push({ type: 'agent_link', ...l, agent: l.agent as any }));
      }
    }

    // Act invitations for this user's email (any role)
    // Use the auth email as the primary source — profile.email may not be populated for newly signed-up users
    const authEmail = user.email || profile?.email || null;
    if (authEmail) {
      const { data: invites } = await supabase
        .from('act_invitations')
        .select('id, role, token, act:act_id(act_name)')
        .eq('email', authEmail)
        .eq('status', 'pending');
      (invites || []).forEach(i => collected.push({ type: 'act_invitation', ...i, act: i.act as any }));
    }

    setNotifs(collected);

    // System notifications (advance due, thank-you due, etc.)
    const { data: sys } = await supabase
      .from('notifications')
      .select('id, type, message, action_url, created_at')
      .eq('user_id', user.id)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(10);
    setSysNotifs((sys || []) as SysNotif[]);
  }, [profile, isSuperAdmin]);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  const respondLink = async (id: string, action: 'accept' | 'decline') => {
    setResponding(id);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/agent-link/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ linkId: id, action }),
    });
    await loadNotifs();
    setResponding('');
  };

  const acceptInvite = async (n: Extract<Notif, { type: 'act_invitation' }>) => {
    setResponding(n.id);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setResponding(''); return; }
    const { data: prof } = await supabase.from('user_profiles').select('display_name').eq('id', user.id).single();
    await fetch('/api/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: n.token, userId: user.id, displayName: prof?.display_name || '' }),
    });
    await loadNotifs();
    setResponding('');
    router.reload();
  };

  const markSysRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setSysNotifs(prev => prev.filter(n => n.id !== id));
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const nav = isSuperAdmin ? agentNav :
    profile?.role === 'agent'     ? agentNav  :
    profile?.role === 'act_admin' ? bandNav   :
    memberNav;

  const isActive = (href: string) => {
    // Root portal pages: exact match only to avoid lighting up for all sub-routes
    if (['/dashboard', '/band', '/member'].includes(href)) return router.pathname === href;
    return router.pathname.startsWith(href);
  };

  return (
    <nav className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-logo">
        <div style={{ fontSize: '2rem', letterSpacing: '0.1em', lineHeight: 1, color: 'var(--accent)', textShadow: 'var(--neon-glow-sm)' }}>
          CAMEL RANCH
        </div>
        <div style={{
          fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.5em', color: 'rgba(200,146,26,0.85)',
          textTransform: 'uppercase', marginTop: '0.25rem',
          borderTop: '1px solid rgba(200,146,26,0.20)', paddingTop: '0.3rem',
        }}>
          BOOKING
        </div>
      </div>

      {profile && (
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            border: '1px solid var(--border)', overflow: 'hidden',
            background: 'var(--bg-overlay)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--accent)', lineHeight: 1 }}>
                  {(profile.display_name || profile.email || '?')[0].toUpperCase()}
                </span>
            }
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.83rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {profile.display_name || profile.email}
            </div>
            {isSuperAdmin ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                fontFamily: 'var(--font-body)', fontSize: '0.68rem',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: '#000', background: 'var(--accent)',
                padding: '0.1rem 0.35rem', borderRadius: '2px',
                boxShadow: 'var(--neon-glow-sm)',
              }}>
                ◈ SUPERADMIN
              </div>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {profile.role === 'agent' ? (profile.agency_name || 'Agent') :
                   profile.role === 'act_admin' ? 'Band Admin' : 'Member'}
                </div>
                {profile.role === 'act_admin' && actName && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--accent)', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {actName}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Portal switcher — superadmin only */}
      {isSuperAdmin && (
        <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
          <div className="sidebar-label">View As</div>
          {portals.map(p => (
            <Link key={p.href} href={p.href}
              className={`sidebar-link${isActive(p.href) ? ' active' : ''}`}
              style={isActive(p.href) ? { color: p.color, borderLeftColor: p.color } : { color: p.color, opacity: 0.7 }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color, flexShrink: 0, boxShadow: `0 0 6px ${p.color}` }} />
              {p.label}
            </Link>
          ))}
        </div>
      )}

      <div className="sidebar-section" style={{ flex: 1 }}>
        <div className="sidebar-label">{isSuperAdmin ? 'Agent Tools' : 'Navigation'}</div>
        {nav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link${isActive(item.href) ? ' active' : ''}`}
            onClick={onClose}
          >
            <span style={{ width: '16px', textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {/* Notifications entry */}
        {(notifs.length > 0 || sysNotifs.length > 0) && (
          <button
            onClick={() => setShowNotifs(v => !v)}
            className="sidebar-link"
            style={{ width: '100%', justifyContent: 'space-between', marginTop: '0.25rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ width: '16px', textAlign: 'center' }}>🔔</span>
              Notifications
            </span>
            <span style={{
              background: '#ef4444', color: '#fff', borderRadius: '999px',
              fontSize: '0.65rem', fontWeight: 700, minWidth: '18px', height: '18px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
            }}>{notifs.length + sysNotifs.length}</span>
          </button>
        )}

        {/* Inline notifications panel */}
        {showNotifs && (notifs.length > 0 || sysNotifs.length > 0) && (
          <div style={{ margin: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* System notifications (advance due, thank-you due, etc.) */}
            {sysNotifs.map(n => {
              const typeColor: Record<string, string> = {
                advance_due:   '#f97316',
                thank_you_due: '#a78bfa',
                follow_up_due: '#fbbf24',
                system:        'var(--accent)',
              };
              const typeLabel: Record<string, string> = {
                advance_due:   'Advance Due',
                thank_you_due: 'Thank You Due',
                follow_up_due: 'Follow Up',
                system:        'Notice',
              };
              return (
                <div key={n.id} style={{
                  background: 'var(--bg-overlay)',
                  border: `1px solid ${typeColor[n.type] || 'var(--accent)'}40`,
                  borderRadius: 'var(--radius-sm)', padding: '0.75rem', fontSize: '0.8rem',
                }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: typeColor[n.type] || 'var(--accent)', marginBottom: '0.3rem' }}>
                    {typeLabel[n.type] || n.type}
                  </div>
                  <div style={{ color: 'var(--text-primary)', lineHeight: 1.45, marginBottom: '0.5rem' }}>{n.message}</div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {n.action_url && (
                      <Link href={n.action_url} onClick={() => { markSysRead(n.id); onClose?.(); }}
                        className="btn btn-sm btn-primary"
                        style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem' }}>
                        Open
                      </Link>
                    )}
                    <button onClick={() => markSysRead(n.id)}
                      className="btn btn-sm"
                      style={{ flex: n.action_url ? 0 : 1, justifyContent: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'transparent' }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
            {notifs.map(n => (
              <div key={n.id} style={{
                background: 'var(--bg-overlay)',
                border: '1px solid rgba(200,146,26,0.25)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem',
                fontSize: '0.8rem',
              }}>
                {n.type === 'agent_link' && (
                  <>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.3rem' }}>
                      Agent Request
                    </div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.15rem' }}>
                      {n.agent.agency_name || n.agent.display_name || n.agent.email}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.4rem' }}>
                      {n.permissions === 'manage' ? 'Full management access' : 'View access'}
                    </div>
                    {n.message && <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.5rem', lineHeight: 1.4 }}>"{n.message}"</p>}
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        className="btn btn-sm"
                        disabled={!!responding}
                        onClick={() => respondLink(n.id, 'decline')}
                        style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem', color: '#f87171', borderColor: '#f87171', background: 'transparent' }}>
                        {responding === n.id ? '…' : 'Decline'}
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={!!responding}
                        onClick={() => respondLink(n.id, 'accept')}
                        style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem' }}>
                        {responding === n.id ? '…' : 'Accept'}
                      </button>
                    </div>
                  </>
                )}
                {n.type === 'act_invitation' && (
                  <>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a78bfa', marginBottom: '0.3rem' }}>
                      Band Invite
                    </div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.15rem' }}>
                      {n.act?.act_name || 'A band'}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.5rem' }}>
                      You've been invited as {n.role === 'act_admin' ? 'Band Admin' : 'Band Member'}
                    </div>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={!!responding}
                      onClick={() => acceptInvite(n)}
                      style={{ width: '100%', justifyContent: 'center', fontSize: '0.72rem', background: '#a78bfa', borderColor: '#a78bfa', color: '#000' }}>
                      {responding === n.id ? '…' : 'Accept Invite'}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '0.5rem 0', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <button
          className="sidebar-link"
          onClick={toggleTheme}
          style={{ width: '100%', justifyContent: 'space-between' }}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ width: '16px', textAlign: 'center', fontSize: '1rem' }}>
              {theme === 'dark' ? '☀' : '☽'}
            </span>
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </span>
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: '0.76rem', letterSpacing: '0.1em',
            color: 'var(--text-muted)', textTransform: 'uppercase',
          }}>
            {theme === 'dark' ? 'ON' : 'OFF'}
          </span>
        </button>

        <button className="sidebar-link" onClick={onSignOut} style={{ width: '100%' }}>
          <span style={{ width: '16px', textAlign: 'center' }}>⏻</span>
          Sign Out
        </button>
      </div>
    </nav>
  );
}
