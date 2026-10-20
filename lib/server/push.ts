// lib/server/push.ts
//
// Push notifications to the Camel Ranch Booking phone app, sent through
// Expo's push service (which forwards to Apple and Google).
//
// - sendExpoPush: low-level sender. Batches, reports which device tokens are
//   dead (uninstalled app) so the caller can delete them.
// - sendShowDayReminders: the daily "show day" reminder, run by the
//   /api/cron/push-show-day job.
//
// Everything here runs with the service role from a cron route, never from a
// user request, so it reads across bands deliberately. Recipients are always
// derived from the booking's own act; nothing comes from request input.
import type { SupabaseClient } from '@supabase/supabase-js';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
export const EXPO_BATCH_SIZE = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default';
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface PushSendResult {
  sent: number;
  failed: number;
  /** Tokens Expo says no longer exist (app removed); safe to delete. */
  deadTokens: string[];
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/**
 * Sends messages through Expo's push service in batches of 100.
 * A failed batch is logged and counted, never thrown, so one bad batch
 * doesn't stop the rest of a reminder run.
 *
 * @param messages the notifications to deliver
 * @param fetchImpl injectable fetch (tests)
 * @returns counts plus tokens Expo reported as no longer registered
 */
export async function sendExpoPush(messages: PushMessage[], fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<PushSendResult> {
  const result: PushSendResult = { sent: 0, failed: 0, deadTokens: [] };
  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
    try {
      const res = await fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.error('[push] Expo push batch rejected', { status: res.status, size: batch.length });
        result.failed += batch.length;
        continue;
      }
      const body = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = Array.isArray(body.data) ? body.data : [];
      batch.forEach((msg, idx) => {
        const ticket = tickets[idx];
        if (ticket?.status === 'ok') {
          result.sent += 1;
          return;
        }
        result.failed += 1;
        if (ticket?.details?.error === 'DeviceNotRegistered') result.deadTokens.push(msg.to);
      });
    } catch (err) {
      console.error('[push] Expo push batch failed', { size: batch.length, error: err instanceof Error ? err.message : String(err) });
      result.failed += batch.length;
    }
  }
  return result;
}

/** "17:00:00" → "5:00 PM"; null for empty/invalid. */
export function formatClock(time: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

interface ShowRow {
  id: string;
  act_id: string;
  load_in_time: string | null;
  set_time: string | null;
  venue: { name: string | null; city: string | null; state: string | null } | null;
}

/** Builds the reminder text for one show. */
export function showDayMessage(show: ShowRow): { title: string; body: string } {
  const venue = show.venue?.name?.trim() || 'your show';
  const place = [show.venue?.city, show.venue?.state].filter(Boolean).join(', ');
  const loadIn = formatClock(show.load_in_time);
  const set = formatClock(show.set_time);
  const parts = [loadIn ? `Load in ${loadIn}` : null, set ? `Set ${set}` : null, place || null].filter(Boolean);
  return {
    title: `Show day: ${venue}`,
    body: parts.length ? parts.join(' · ') : 'Open your day sheet for the details.',
  };
}

/**
 * Sends a "show day" reminder for every confirmed show on `date` to the band's
 * admins and to each member on that show who hasn't declined. Dead tokens are
 * removed afterwards.
 *
 * @param service service-role Supabase client
 * @param date show date, "YYYY-MM-DD"
 * @param fetchImpl injectable fetch (tests)
 */
export async function sendShowDayReminders(
  service: SupabaseClient,
  date: string,
  fetchImpl?: FetchLike,
): Promise<PushSendResult & { shows: number }> {
  const { data: shows, error: showsErr } = await service
    .from('bookings')
    .select('id, act_id, load_in_time, set_time, venue:venue_id ( name, city, state )')
    .eq('show_date', date)
    .eq('status', 'confirmed');
  if (showsErr) throw new Error(`Couldn't load today's shows: ${showsErr.message}`);

  const messages: PushMessage[] = [];
  for (const raw of (shows ?? []) as unknown as Array<ShowRow & { venue: ShowRow['venue'] | ShowRow['venue'][] }>) {
    const show: ShowRow = { ...raw, venue: Array.isArray(raw.venue) ? (raw.venue[0] ?? null) : raw.venue };
    const userIds = await recipientsForShow(service, show);
    if (userIds.length === 0) continue;

    const { data: tokens, error: tokErr } = await service.from('push_tokens').select('token').in('user_id', userIds);
    if (tokErr) {
      console.error('[push] token lookup failed', { bookingId: show.id, error: tokErr.message });
      continue;
    }
    const { title, body } = showDayMessage(show);
    for (const t of tokens ?? []) {
      messages.push({ to: (t as { token: string }).token, title, body, sound: 'default', data: { type: 'show_day', bookingId: show.id } });
    }
  }

  const result = await sendExpoPush(messages, fetchImpl);
  if (result.deadTokens.length) {
    const { error } = await service.from('push_tokens').delete().in('token', result.deadTokens);
    if (error) console.error('[push] could not remove dead tokens', { count: result.deadTokens.length, error: error.message });
  }
  return { ...result, shows: shows?.length ?? 0 };
}

/** Band admins of the show's act, plus linked members on the show who haven't declined. */
async function recipientsForShow(service: SupabaseClient, show: ShowRow): Promise<string[]> {
  const ids = new Set<string>();

  const { data: admins, error: adminErr } = await service
    .from('profiles')
    .select('id')
    .eq('act_id', show.act_id)
    .eq('role', 'band_admin');
  if (adminErr) console.error('[push] admin lookup failed', { bookingId: show.id, error: adminErr.message });
  for (const a of admins ?? []) ids.add((a as { id: string }).id);

  const { data: crew, error: crewErr } = await service
    .from('booking_personnel')
    .select('status, personnel:personnel_id ( linked_user_id, is_active )')
    .eq('booking_id', show.id)
    .neq('status', 'declined');
  if (crewErr) console.error('[push] crew lookup failed', { bookingId: show.id, error: crewErr.message });
  for (const row of (crew ?? []) as Array<{ personnel: { linked_user_id: string | null; is_active: boolean } | { linked_user_id: string | null; is_active: boolean }[] | null }>) {
    const p = Array.isArray(row.personnel) ? row.personnel[0] : row.personnel;
    if (p?.linked_user_id && p.is_active !== false) ids.add(p.linked_user_id);
  }
  return [...ids];
}
