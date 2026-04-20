import Link from 'next/link';
import { useRouter } from 'next/router';
import { UserProfile } from '../../lib/types';

interface Props {
  profile: UserProfile | null;
  onSignOut: () => void;
}

const agentNav = [
  { label: 'Dashboard', href: '/dashboard', icon: '◈' },
  { label: 'Bands',     href: '/acts',      icon: '♪' },
  { label: 'Bookings',  href: '/bookings',  icon: '◉' },
  { label: 'Tours',     href: '/tours',     icon: '⟴' },
  { label: 'Venues',    href: '/venues',    icon: '⌂' },
  { label: 'Contacts',  href: '/contacts',  icon: '◷' },
  { label: 'Email',     href: '/email',     icon: '✉' },
  { label: 'Settings',  href: '/settings',  icon: '⚙' },
];

const bandNav = [
  { label: 'Shows',    href: '/band',          icon: '◉' },
  { label: 'Calendar', href: '/band/calendar',  icon: '◷' },
  { label: 'Members',  href: '/band/members',   icon: '◈' },
];

const memberNav = [
  { label: 'My Shows',  href: '/member',         icon: '◉' },
  { label: 'Calendar',  href: '/member/calendar', icon: '◷' },
];

const portals = [
  { label: 'Agent View',       href: '/dashboard', color: 'var(--accent)' },
  { label: 'Band Admin View',  href: '/band',      color: '#a78bfa' },
  { label: 'Member View',      href: '/member',    color: '#34d399' },
];

export default function Sidebar({ profile, onSignOut }: Props) {
  const router = useRouter();
  const isSuperAdmin = profile?.role === 'superadmin';

  const nav = isSuperAdmin ? agentNav :
    profile?.role === 'agent'     ? agentNav  :
    profile?.role === 'act_admin' ? bandNav   :
    memberNav;

  const isActive = (href: string) =>
    href === '/dashboard'
      ? router.pathname === href
      : router.pathname.startsWith(href);

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <div style={{ fontSize: '1.65rem', letterSpacing: '0.12em', lineHeight: 1, color: 'var(--accent)', textShadow: 'var(--neon-glow-sm)' }}>
          CAMEL RANCH
        </div>
        <div style={{
          fontSize: '0.72rem', letterSpacing: '0.45em', color: 'rgba(0,229,255,0.55)',
          textTransform: 'uppercase', marginTop: '0.2rem',
          borderTop: '1px solid rgba(0,229,255,0.2)', paddingTop: '0.3rem',
        }}>
          BOOKING
        </div>
      </div>

      {profile && (
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.83rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.15rem' }}>
            {profile.display_name || profile.email}
          </div>
          {isSuperAdmin ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: '#000', background: 'var(--accent)',
              padding: '0.15rem 0.45rem', borderRadius: '2px',
              boxShadow: 'var(--neon-glow-sm)', marginTop: '0.2rem',
            }}>
              ◈ SUPERADMIN
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {profile.role === 'agent' ? (profile.agency_name || 'Agent') :
               profile.role === 'act_admin' ? 'Band Admin' : 'Member'}
            </div>
          )}
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
          >
            <span style={{ width: '16px', textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>

      <div style={{ padding: '0.75rem 0', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <button className="sidebar-link" onClick={onSignOut} style={{ width: '100%' }}>
          <span style={{ width: '16px', textAlign: 'center' }}>⏻</span>
          Sign Out
        </button>
      </div>
    </nav>
  );
}
