// lib/accountSide.ts
// Every login belongs to exactly one side of the platform:
//   - the band side (superadmin, band admin, member), or
//   - the Booking Agent workspace (/agent/*).
// The two sides never meet. These helpers are the single place that decides
// where a signed-in account belongs, so the band sign-in (/login), the agent
// sign-in (/agent/login), the band AppShell and the agent BookerShell all
// route the same way.
//
// UI routing only. The database (RLS on booker_profiles and the band tables)
// is the security boundary; this just keeps people out of the wrong screens.

import { supabase } from './supabase';

/** The band-side landing page for a profile role. */
export function bandSideHome(role: string | null | undefined): string {
  if (role === 'superadmin') return '/admin';
  if (role === 'member') return '/member/calendar';
  return '/band';
}

/**
 * Where to send an agent after the agent sign-in. Only same-site paths inside
 * the agent workspace are honoured; anything else (other sites, band pages,
 * protocol-relative URLs) falls back to the workspace home.
 */
export function safeAgentNext(next: unknown): string {
  if (typeof next !== 'string' || next.startsWith('//')) return '/agent';
  return /^\/agent(\/[A-Za-z0-9/_-]*)?(\?[^\s]*)?$/.test(next) ? next : '/agent';
}

/**
 * An agent account is a profile with no band and an active Booking Agent
 * workspace (see pages/api/booker/register.ts). Band accounts always have a
 * band or are superadmin/member, so they can never qualify.
 */
export function isAgentShape(role: string | null | undefined, actId: string | null | undefined): boolean {
  return role !== 'superadmin' && role !== 'member' && !actId;
}

/**
 * True when the user has an active Booking Agent workspace, false when they do
 * not, and null when the lookup failed (callers decide how to fail safe).
 */
export async function fetchHasAgentWorkspace(userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('booker_profiles')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      console.error('[accountSide] agent workspace lookup failed', { code: error.code });
      return null;
    }
    return Boolean(data);
  } catch (err) {
    console.error('[accountSide] agent workspace lookup threw', err);
    return null;
  }
}
