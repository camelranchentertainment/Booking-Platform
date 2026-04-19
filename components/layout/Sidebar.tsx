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

export default function Sidebar({ profile, onSignOut }: Props) {
  const router = useRouter();

  const nav =
    profile?.role === 'agent'     ? agentNav  :
    profile?.role === 'act_admin' ? bandNav   :
    memberNav;

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        CAMEL RANCH<br />
        <span style={{ fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--text-muted)' }}>
          BOOKING
        </span>
      </div>

      {profile && (
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
            {profile.display_name || profile.email}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '0.15rem' }}>
            {profile.role === 'agent' ? (profile.agency_name || 'Agent') :
             profile.role === 'act_admin' ? 'Band Admin' : 'Member'}
          </div>
        </div>
      )}

      <div className="sidebar-section" style={{ flex: 1 }}>
        <div className="sidebar-label">Navigation</div>
        {nav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link${router.pathname.startsWith(item.href) && item.href !== '/dashboard' || router.pathname === item.href ? ' active' : ''}`}
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
