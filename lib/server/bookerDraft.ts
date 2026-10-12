// lib/server/bookerDraft.ts
// Loads what "Draft with AI" needs to know, strictly from the calling agent's
// own rows (service role: every query is scoped to bookerId), and enforces the
// per-agent AI rate limit through booker_ai_events.

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../apiError';
import { addDays, formatShowDate, formatTime } from '../booker/dates';
import { formatMoney } from '../booker/commission';
import { templateByKey } from '../booker/templates';
import type { DraftRequestInput } from '../booker/schemas';
import type { ResolvedLinks } from './bookerMessages';
import type { DraftFacts } from './bookerDraftPrompt';

export const AI_DRAFT_LIMITS = { perHour: 30, perDay: 150 } as const;

type Row = Record<string, unknown>;

async function one(service: SupabaseClient, table: string, columns: string, id: string | null, bookerId: string): Promise<Row | null> {
  if (!id) return null;
  const { data } = await service.from(table).select(columns).eq('id', id).eq('booker_id', bookerId).is('deleted_at', null).maybeSingle();
  return (data as Row | null) ?? null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/**
 * Counts recent AI requests and records this one. Recording before the model
 * call means a burst of parallel requests cannot all slip under the limit.
 *
 * @throws AppError 429 when the agent is over the hourly or daily limit
 */
export async function claimAiDraft(service: SupabaseClient, bookerId: string, now: Date = new Date()): Promise<void> {
  const count = async (sinceMs: number) => {
    const { count: n, error } = await service
      .from('booker_ai_events')
      .select('id', { count: 'exact', head: true })
      .eq('booker_id', bookerId)
      .eq('kind', 'email_draft')
      .gte('created_at', new Date(now.getTime() - sinceMs).toISOString());
    if (error) throw new AppError(500, 'Could not check your AI limit', false);
    return n ?? 0;
  };
  if ((await count(3_600_000)) >= AI_DRAFT_LIMITS.perHour) throw new AppError(429, 'You have used AI drafting a lot this hour. Try again in a little while, or start from a template.');
  if ((await count(86_400_000)) >= AI_DRAFT_LIMITS.perDay) throw new AppError(429, "You have reached today's AI drafting limit. Templates still work.");
  const { error } = await service.from('booker_ai_events').insert({ booker_id: bookerId, kind: 'email_draft' });
  if (error) throw new AppError(500, 'Could not start the AI draft', false);
}

/** Gathers the facts for the prompt from the agent's own data. */
export async function loadDraftFacts(service: SupabaseClient, bookerId: string, links: ResolvedLinks, input: DraftRequestInput, today: string): Promise<DraftFacts> {
  const year = Number(today.slice(0, 4));
  const [booker, band, venue, contact, show] = await Promise.all([
    service.from('booker_profiles').select('agency_name, contact_name, contact_phone').eq('id', bookerId).maybeSingle().then(r => (r.data as Row | null) ?? null),
    one(service, 'booker_roster', 'band_name, genre, home_city, home_state', links.roster_id, bookerId),
    one(service, 'booker_venues', 'name, city, state, kind, capacity', links.venue_id, bookerId),
    one(service, 'booker_contacts', 'name, title', links.contact_id, bookerId),
    one(service, 'booker_shows', 'show_date, status, set_time, load_in_time, fee, venue_name, venue_city', links.show_id, bookerId),
  ]);
  if (!booker) throw new AppError(500, 'Could not load your agent profile', false);

  // Known relationship: a confirmed/played show for any of the agent's bands there, or mail already sent there.
  let familiar = input.audience === 'band';
  if (!familiar && links.venue_id) {
    const [{ count: shows }, { count: mails }] = await Promise.all([
      service.from('booker_shows').select('id', { count: 'exact', head: true }).eq('booker_id', bookerId).eq('venue_id', links.venue_id).in('status', ['confirmed', 'played']).is('deleted_at', null),
      service.from('booker_messages').select('id', { count: 'exact', head: true }).eq('booker_id', bookerId).eq('venue_id', links.venue_id).eq('status', 'sent').is('deleted_at', null),
    ]);
    familiar = (shows ?? 0) > 0 || (mails ?? 0) > 0;
  }

  // Routing: the band's confirmed dates within three days of this show.
  const nearbyShows: DraftFacts['nearbyShows'] = [];
  const showDate = str(show?.show_date);
  if (links.roster_id && showDate) {
    const { data: near } = await service
      .from('booker_shows')
      .select('id, show_date, venue_name, venue_city, venue_id')
      .eq('booker_id', bookerId)
      .eq('roster_id', links.roster_id)
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .gte('show_date', addDays(showDate, -3))
      .lte('show_date', addDays(showDate, 3))
      .order('show_date', { ascending: true })
      .limit(6);
    for (const s of (near as Row[] | null) ?? []) {
      if (s.id === links.show_id) continue;
      const place = [str(s.venue_name), str(s.venue_city)].filter(Boolean).join(', ') || 'a confirmed show';
      nearbyShows.push({ date: formatShowDate(String(s.show_date), year), place });
    }
  }

  const tpl = input.template_key ? templateByKey(input.template_key) : undefined;
  return {
    agency: String(booker.agency_name),
    agentName: str(booker.contact_name),
    agentPhone: str(booker.contact_phone),
    audience: input.audience,
    band: band ? { name: String(band.band_name), genre: str(band.genre), homeCity: [str(band.home_city), str(band.home_state)].filter(Boolean).join(', ') || null } : null,
    venue: venue ? { name: String(venue.name), city: str(venue.city), state: str(venue.state), kind: String(venue.kind ?? 'venue'), capacity: typeof venue.capacity === 'number' ? venue.capacity : null } : null,
    contact: contact ? { name: String(contact.name), title: str(contact.title) } : null,
    toName: input.to_name,
    show: show
      ? {
          date: formatShowDate(String(show.show_date), year),
          status: String(show.status),
          setTime: formatTime(str(show.set_time)),
          loadIn: formatTime(str(show.load_in_time)),
          fee: show.fee === null || show.fee === undefined ? null : formatMoney(Number(show.fee)),
        }
      : null,
    nearbyShows,
    relationship: familiar ? 'familiar' : 'new',
    template: tpl ? { label: tpl.label, subject: tpl.subject, body: tpl.body } : null,
    instructions: input.instructions,
  };
}
