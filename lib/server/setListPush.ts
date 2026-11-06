// lib/server/setListPush.ts
//
// "Push to Band" for set lists: after publish_set_list() freezes a new version,
// tell everyone on that show's lineup — an in-app notification (bell menu) and
// a phone push through Expo.
//
// Runs with the service role from pages/api/set-lists/[id]/publish.ts, AFTER
// that route has verified the caller is a band admin of the set list's band.
// Recipients are always derived from the set list's own booking; nothing here
// comes from request input. Delivery is best-effort: the set list is already
// published, so a failed notice or push is logged and counted, never thrown.

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatShowDate } from '../formatDate';
import { sendExpoPush, type PushMessage, type PushSendResult } from './push';

/** A member who should hear about the set list. */
export interface SetListRecipient {
  userId: string;
  /** booking_personnel.id — the member show page lives at /member/shows/<this>. */
  bookingPersonnelId: string;
}

type CrewRow = {
  id: string;
  status: string | null;
  personnel:
    | { linked_user_id: string | null; is_active: boolean | null }
    | Array<{ linked_user_id: string | null; is_active: boolean | null }>
    | null;
};

/**
 * Members on the show's lineup who have a login, are active and haven't
 * declined. One entry per person (a person listed twice is notified once).
 *
 * @param service service-role client
 * @param bookingId the set list's show
 * @param excludeUserId the admin who pushed (they don't need a notice)
 * @throws Error when the lineup can't be read
 */
export async function setListRecipients(
  service: SupabaseClient,
  bookingId: string,
  excludeUserId: string,
): Promise<SetListRecipient[]> {
  const { data, error } = await service
    .from('booking_personnel')
    .select('id, status, personnel:personnel_id ( linked_user_id, is_active )')
    .eq('booking_id', bookingId)
    .neq('status', 'declined');
  if (error) throw new Error(`Couldn't read the show lineup: ${error.message}`);

  const byUser = new Map<string, SetListRecipient>();
  for (const row of (data ?? []) as CrewRow[]) {
    const p = Array.isArray(row.personnel) ? row.personnel[0] : row.personnel;
    const userId = p?.linked_user_id;
    if (!userId || p?.is_active === false || userId === excludeUserId || byUser.has(userId)) continue;
    byUser.set(userId, { userId, bookingPersonnelId: row.id });
  }
  return [...byUser.values()];
}

export interface SetListPushText {
  title: string;
  body: string;
}

/**
 * Notification wording. Version 1 is "New set list"; later pushes say "updated".
 *
 * @param input set list name, version just published, and the show it's for
 */
export function setListPushText(input: {
  name: string;
  version: number;
  venueName: string | null;
  showDate: string | null;
}): SetListPushText {
  const venue = input.venueName?.trim() || 'your show';
  const date = input.showDate ? formatShowDate(input.showDate, { weekday: 'short', month: 'short', day: 'numeric' }) : null;
  const where = date ? `${venue} · ${date}` : venue;
  return input.version > 1
    ? { title: `Set list updated: ${venue}`, body: `${input.name} changed (version ${input.version}). ${where}` }
    : { title: `New set list: ${venue}`, body: `${input.name} is ready. ${where}` };
}

export interface SetListDelivery {
  notified: number;
  push: PushSendResult;
}

type FetchLike = Parameters<typeof sendExpoPush>[1];

/**
 * Writes one bell-menu notice per recipient and sends phone pushes to their
 * devices, then removes device tokens Expo says are gone.
 *
 * @param service service-role client
 * @param args who to tell, what to say, and the identifiers for deep links
 * @param fetchImpl injectable fetch (tests)
 */
export async function deliverSetListPush(
  service: SupabaseClient,
  args: {
    actId: string;
    setListId: string;
    bookingId: string;
    version: number;
    recipients: readonly SetListRecipient[];
    text: SetListPushText;
  },
  fetchImpl?: FetchLike,
): Promise<SetListDelivery> {
  const empty: SetListDelivery = { notified: 0, push: { sent: 0, failed: 0, deadTokens: [] } };
  if (args.recipients.length === 0) return empty;

  let notified = 0;
  const { error: noticeErr } = await service.from('notifications').insert(
    args.recipients.map(r => ({
      user_id: r.userId,
      act_id: args.actId,
      type: 'set_list_published',
      title: args.text.title,
      message: args.text.body,
      related_id: args.setListId,
      action_url: `/member/shows/${r.bookingPersonnelId}`,
    })),
  );
  if (noticeErr) console.error('[set-lists] notification insert failed', { setListId: args.setListId, code: noticeErr.code });
  else notified = args.recipients.length;

  const { data: tokens, error: tokErr } = await service
    .from('push_tokens')
    .select('token')
    .in('user_id', args.recipients.map(r => r.userId));
  if (tokErr) {
    console.error('[set-lists] push token lookup failed', { setListId: args.setListId, code: tokErr.code });
    return { ...empty, notified };
  }

  const messages: PushMessage[] = ((tokens ?? []) as Array<{ token: string }>).map(t => ({
    to: t.token,
    title: args.text.title,
    body: args.text.body,
    sound: 'default',
    data: { type: 'set_list', setListId: args.setListId, bookingId: args.bookingId, version: String(args.version) },
  }));
  const push = await sendExpoPush(messages, fetchImpl);

  if (push.deadTokens.length) {
    const { error } = await service.from('push_tokens').delete().in('token', push.deadTokens);
    if (error) console.error('[set-lists] could not remove dead tokens', { count: push.deadTokens.length, code: error.code });
  }
  return { notified, push };
}
