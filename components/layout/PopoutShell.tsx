// components/layout/PopoutShell.tsx
//
// Bare page frame for a pop-out window (the booking agent at /band/agent):
// no sidebar, banner or pill bar — the content fills the window. Access is
// gated by the same rules as AppShell (lib/hooks/useShellAccess.ts).

import type { ReactNode } from 'react';
import { useShellAccess, type RequireRole } from '../../lib/hooks/useShellAccess';

interface Props {
  children: ReactNode;
  requireRole?: RequireRole;
}

const loadingStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: '100vh', background: 'var(--bg-base)',
  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.85rem',
  letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase',
};

/** Renders children once the signed-in user may see the page; redirects otherwise. */
export default function PopoutShell({ children, requireRole = null }: Props) {
  const { user, profile, authLoading } = useShellAccess(requireRole);

  // Redirects run in the hook; until auth settles (or while one is under way) show a holding screen.
  const allowed = Array.isArray(requireRole) ? requireRole : requireRole ? [requireRole] : null;
  const roleOk = !allowed || profile?.role === 'superadmin' || allowed.includes(profile?.role as never);
  if (authLoading || !user || !profile || !roleOk) {
    return <div style={loadingStyle} role="status">Loading…</div>;
  }

  return <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>{children}</div>;
}
