// components/venues/venueSession.ts
//
// The signed-in user's id, access token and band, read once per action by the
// Venues page and its dialogs. The band always comes from the caller's
// profile (lib/bookingQueries#getActId), never from the page.

import { supabase } from '../../lib/supabase';
import { getActId } from '../../lib/bookingQueries';

export interface VenueSession {
  userId: string;
  token: string;
  /** null when the user isn't on a band yet. */
  actId: string | null;
}

/** Current session plus band, or null when signed out. Never throws. */
export async function getVenueSession(): Promise<VenueSession | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const actId = await getActId(supabase, session.user.id);
    return { userId: session.user.id, token: session.access_token, actId: actId ?? null };
  } catch (err) {
    console.error('[venues] session lookup failed', err);
    return null;
  }
}

/** Bearer header for this app's API routes. */
export const authHeader = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });
