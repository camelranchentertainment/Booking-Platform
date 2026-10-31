// lib/server/agent/snapshot.ts
//
// A small "front page" of the band handed to the agent on every turn: who the
// band is, what's next, and the ids it needs to call tools. Everything deeper
// (show times, notes, money, outreach, the inbox) is fetched on demand through
// the read tools, so the snapshot stays small and the prompt stays cheap.

import type { SupabaseClient } from '@supabase/supabase-js';
import { clip } from './readTools';

type Tour = { id: string; name: string; status: string; start_date: string | null; end_date: string | null };
type Show = { id: string; show_date: string | null; status: string; entry_type: string | null; venue: { name: string; city: string | null; state: string | null } | null; tour: { name: string } | null };

/** How many upcoming shows the snapshot lists; the rest are a get_shows call away. */
export const SNAPSHOT_UPCOMING = 10;

/**
 * Builds the snapshot text. Fails soft: a section that can't load says so,
 * so the agent knows to use a tool instead of concluding there's nothing.
 *
 * @param service - Service-role client; every query filters on actId.
 * @param actId - The caller's band.
 * @param today - YYYY-MM-DD.
 * @returns Plain text for the system prompt.
 */
export async function buildAgentSnapshot(service: SupabaseClient, actId: string, today: string): Promise<string> {
  const [actRes, toursRes, upcomingRes, pipelineRes, rosterRes] = await Promise.all([
    service.from('acts').select('act_name, genre, bio, website, sync_enabled, calendar_name').eq('id', actId).maybeSingle(),
    service.from('tours').select('id, name, status, start_date, end_date')
      .eq('act_id', actId).not('status', 'in', '(completed,cancelled)').order('start_date', { ascending: true, nullsFirst: false }).limit(15),
    service.from('bookings').select('id, show_date, status, entry_type, venue:venues(name, city, state), tour:tours(name)')
      .eq('act_id', actId).gte('show_date', today).in('status', ['confirmed', 'advancing', 'contract'])
      .order('show_date', { ascending: true }).limit(SNAPSHOT_UPCOMING),
    service.from('bookings').select('status')
      .eq('act_id', actId).in('status', ['pitch', 'followup', 'negotiation', 'hold']).gte('show_date', today).limit(500),
    // Names and roles only: pay rates and contact details stay out of the prompt.
    service.from('act_personnel').select('name, instrument_role, is_active').eq('act_id', actId).eq('is_active', true).order('name').limit(30),
  ]);

  const act = actRes.data as { act_name: string | null; genre: string | null; bio: string | null; website: string | null; sync_enabled: boolean | null; calendar_name: string | null } | null;
  const lines: string[] = [
    `Band: ${act?.act_name ?? '(name not set)'}${act?.genre ? ` — ${act.genre}` : ''}`,
    act?.bio ? `Bio: ${clip(act.bio, 400)}` : '',
    act?.website ? `Website: ${act.website}` : '',
    `Today: ${today}`,
    `Google Calendar sync: ${act?.sync_enabled ? `ON${act.calendar_name ? ` ("${act.calendar_name}")` : ''}` : 'OFF'}`,
    '',
  ];

  if (toursRes.error) lines.push('Open tours: (could not load — use get_tours)');
  else {
    const tours = (toursRes.data ?? []) as Tour[];
    lines.push(`Open tours (${tours.length}):`, ...(tours.length
      ? tours.map(t => `- tour_id=${t.id} "${t.name}" [${t.status}] ${t.start_date ?? '?'} to ${t.end_date ?? '?'}`)
      : ['- none']));
  }
  lines.push('');

  if (upcomingRes.error) lines.push('Next shows: (could not load — use get_shows)');
  else {
    const shows = (upcomingRes.data ?? []) as unknown as Show[];
    lines.push(`Next ${shows.length} booked shows (more via get_shows):`, ...(shows.length
      ? shows.map(s => `- booking_id=${s.id} ${s.show_date} [${s.status}]${s.entry_type === 'travel' ? ' TRAVEL' : ''} `
        + `${s.venue ? `${s.venue.name}${s.venue.city ? `, ${s.venue.city}` : ''}${s.venue.state ? ` ${s.venue.state}` : ''}` : 'no venue'}`
        + `${s.tour ? ` · ${s.tour.name}` : ''}`)
      : ['- nothing booked ahead']));
  }

  if (!pipelineRes.error) {
    const counts = (pipelineRes.data ?? []).reduce<Record<string, number>>((acc, r) => {
      const s = (r as { status: string }).status;
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(', ');
    lines.push(`Upcoming pipeline: ${summary || 'nothing on hold or in negotiation'}`);
  }
  lines.push('');

  if (!rosterRes.error) {
    const roster = (rosterRes.data ?? []) as Array<{ name: string; instrument_role: string | null }>;
    lines.push(`Active roster: ${roster.length ? roster.map(r => `${r.name}${r.instrument_role ? ` (${r.instrument_role})` : ''}`).join(', ') : 'none listed'}`);
  }

  return lines.filter((l, i, all) => !(l === '' && all[i - 1] === '')).join('\n').trim();
}
