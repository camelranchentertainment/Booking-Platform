import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { UserProfile } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import BrandLogo from '../BrandLogo';

interface Props {
  profile: UserProfile | null;
  onSignOut: () => void;
  open?: boolean;
  onClose?: () => void;
}

type Notif =
  | { type: 'act_invitation'; id: string; role: string; token: string; act: { act_name: string } | null };

type SysNotif = {
  id: string;
  type: string;
  message: string;
  action_url: string | null;
  created_at: string;
};

const superadminNav = [
  { label: 'Platform Admin', href: '/admin', icon: '◈' },
];

const bandAdminNav = [
  { label: 'Dashboard',  href: '/band',         icon: '◈' },
  { label: 'Tours',      href: '/tours',        icon: '⟴' },
  { label: 'Venues',     href: '/venues',       icon: '⌂' },
  { label: 'Email',      href: '/email',        icon: '✉' },
  { label: 'Calendar',   href: '/calendar',     icon: '◷' },
  { label: 'Analytics',  href: '/analytics',    icon: '↗' },
  { label: 'Financials', href: '/financials',   icon: '$' },
  { label: 'History',    href: '/history',      icon: '◎' },
  { label: 'Media',      href: '/media',        icon: '⬛' },
  { label: 'Socials',    href: '/social',       icon: '✦' },
  { label: 'Members',    href: '/band/members', icon: '♟' },
  { label: 'Settings',   href: '/settings',     icon: '⚙' },
];

const memberNav = [
  { label: 'Dashboard', href: '/member',          icon: '◈' },
  { label: 'Today',     href: '/today',           icon: '◉' },
  { label: 'Calendar',  href: '/member/calendar', icon: '◷' },
  { label: 'History',   href: '/history',         icon: '◎' },
];

export default function Sidebar({ profile, onSignOut, open, onClose }: Props) {
  const router = useRouter();
  const isSuperAdmin = profile?.role === 'superadmin';
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [notifs, setNotifs]       = useState<Notif[]>([]);
  const [sysNotifs, setSysNotifs] = useState<SysNotif[]>([]);
  const [inboxCount, setInboxCount] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (saved) setTheme(saved);
    const cnt = localStorage.getItem('inbox_count');
    if (cnt) setInboxCount(parseInt(cnt, 10) || 0);
  }, []);

  const loadNotifs = useCallback(async () => {
    if (!profile) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const collected: Notif[] = [];
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

    const { data: sys } = await supabase
      .from('notifications')
      .select('id, type, message, action_url, created_at')
      .eq('user_id', user.id)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(10);
    setSysNotifs((sys || []) as SysNotif[]);
  }, [profile]);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const nav = isSuperAdmin ? superadminNav : profile?.role === 'band_admin' ? bandAdminNav : memberNav;

  const isActive = (href: string) => {
    if (['/dashboard', '/band', '/member'].includes(href)) return router.pathname === href;
    return router.pathname.startsWith(href);
  };

  const totalNotifs = notifs.length + sysNotifs.length;

  return (
    <nav className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-logo" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <BrandLogo variant="square" width={80} />
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
                &#x25C8; SUPERADMIN
              </div>
            ) : (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {profile.role === 'band_admin' ? 'Band Admin' : 'Member'}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sidebar-section" style={{ flex: 1 }}>
        <div className="sidebar-label">Navigation</div>
        {nav.map(item => {
          const badge = item.href === '/email' && inboxCount > 0 ? inboxCount : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${isActive(item.href) ? ' active' : ''}`}
              onClick={onClose}
              style={badge ? { justifyContent: 'space-between' } : undefined}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{ width: '16px', textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </span>
              {badge > 0 && (
                <span style={{
                  background: '#ef4444', color: '#fff', borderRadius: '999px',
                  fontSize: '0.65rem', fontWeight: 700, minWidth: '18px', height: '18px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                }}>{badge}</span>
              )}
            </Link>
          );
        })}

        {/* Notification hint — full panel lives in the bell (top banner) */}
        {totalNotifs > 0 && (
          <div style={{
            marginTop: '0.5rem', padding: '0.4rem 0.75rem',
            borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}>
            <span style={{ fontSize: '0.8rem' }}>&#x1F514;</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: '#fbbf24' }}>
              {totalNotifs} unread
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              &uarr; bell
            </span>
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
          <span style={{ width: '16px', textAlign: 'center' }}>&#x23FB;</span>
          Sign Out
        </button>
      </div>
    </nav>
  );
}
