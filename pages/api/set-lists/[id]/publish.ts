// pages/api/set-lists/[id]/publish.ts
//
// Push to Band.
//   GET  → { data: { recipients } }   how many members will be told (for the confirm dialog)
//   POST → publishes the set list and notifies the show's lineup
//          { data: { version, changed, notified, pushed, pushFailed } }
//
// Band admins only. The band comes from the caller's profile (requireBandAdmin);
// the set list must belong to that band or it is treated as not found.
// Publishing runs through publish_set_list() on a client signed in AS the caller,
// so the database's own admin check and RLS decide too — the service role is
// used only to read the lineup, write notices and send pushes.
//
// Idempotent: publish_set_list() returns changed=false when nothing changed since
// the last push, and then nobody is notified again (a double-click is harmless).
// Only set lists attached to a show can be pushed; members see set lists on
// their show page, so a template is copied to a show first.

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../../../../lib/apiError';
import { getServiceClient } from '../../../../lib/supabase';
import { requireBandAdmin } from '../../../../lib/server/requireBandAdmin';
import { deliverSetListPush, setListPushText, setListRecipients } from '../../../../lib/server/setListPush';

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key';

const idSchema = z.uuid();
const publishResultSchema = z.object({
  set_list_id: z.string(),
  version: z.number().int().nonnegative(),
  published_at: z.string().nullable(),
  changed: z.boolean(),
});

type ErrorCode =
  | 'METHOD_NOT_ALLOWED' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'NOT_FOUND'
  | 'TEMPLATE_NOT_PUSHABLE' | 'SHOW_NOT_FOUND' | 'READ_FAILED' | 'PUBLISH_FAILED';

function fail(res: NextApiResponse, status: number, code: ErrorCode, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/** A client that acts as the caller, so RLS and the function's own checks apply. */
function userClient(token: string): SupabaseClient {
  return createClient(SB_URL, SB_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Handles GET (recipient count) and POST (publish + notify) for one set list.
 *
 * @param req `query.id` is the set list id; `Authorization: Bearer <token>` required
 * @param res JSON `{ data }` or `{ error: { code, message } }`
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.');
  }

  const service = getServiceClient();
  let actId: string;
  let userId: string;
  try {
    ({ actId, userId } = await requireBandAdmin(req, service));
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 401;
    return fail(res, status, status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED',
      status === 403 ? 'Only band admins can push set lists.' : 'Sign in again to continue.');
  }

  const parsedId = idSchema.safeParse(req.query.id);
  if (!parsedId.success) return fail(res, 400, 'VALIDATION_ERROR', 'That set list link isn’t valid.');
  const setListId = parsedId.data;

  // Scope check with the caller's band: another band's set list is "not found", never "forbidden".
  const { data: list, error: listErr } = await service
    .from('set_lists')
    .select('id, name, booking_id, act_id')
    .eq('id', setListId)
    .eq('act_id', actId)
    .is('deleted_at', null)
    .maybeSingle();
  if (listErr) {
    console.error('[set-lists/publish] set list read failed', { setListId, code: listErr.code });
    return fail(res, 500, 'READ_FAILED', 'Couldn’t load that set list. Try again.');
  }
  if (!list) return fail(res, 404, 'NOT_FOUND', 'That set list no longer exists.');
  const row = list as { id: string; name: string; booking_id: string | null; act_id: string };
  if (!row.booking_id) {
    return fail(res, 409, 'TEMPLATE_NOT_PUSHABLE', 'Templates can’t be pushed. Copy it to a show, then push that set list.');
  }

  const { data: show, error: showErr } = await service
    .from('bookings')
    .select('id, show_date, venue:venue_id ( name )')
    .eq('id', row.booking_id)
    .eq('act_id', actId)
    .maybeSingle();
  if (showErr) {
    console.error('[set-lists/publish] show read failed', { setListId, code: showErr.code });
    return fail(res, 500, 'READ_FAILED', 'Couldn’t load the show for this set list. Try again.');
  }
  if (!show) return fail(res, 409, 'SHOW_NOT_FOUND', 'The show for this set list is gone, so there’s no one to send it to.');
  const showRow = show as { id: string; show_date: string | null; venue: { name: string | null } | Array<{ name: string | null }> | null };
  const venueName = (Array.isArray(showRow.venue) ? showRow.venue[0]?.name : showRow.venue?.name) ?? null;

  let recipients;
  try {
    recipients = await setListRecipients(service, row.booking_id, userId);
  } catch (err) {
    console.error('[set-lists/publish] lineup read failed', { setListId, message: err instanceof Error ? err.message : String(err) });
    return fail(res, 500, 'READ_FAILED', 'Couldn’t read who’s on this show. Try again.');
  }

  if (req.method === 'GET') {
    res.status(200).json({ data: { recipients: recipients.length } });
    return;
  }

  // Publish as the caller. The bearer token was validated by requireBandAdmin above.
  const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
  const { data: published, error: pubErr } = await userClient(token).rpc('publish_set_list', { p_set_list_id: setListId });
  if (pubErr) {
    console.error('[set-lists/publish] publish failed', { setListId, code: pubErr.code });
    if (pubErr.code === '42501') return fail(res, 403, 'FORBIDDEN', 'Only band admins can push set lists.');
    if (pubErr.code === 'P0002') return fail(res, 404, 'NOT_FOUND', 'That set list no longer exists.');
    return fail(res, 500, 'PUBLISH_FAILED', 'Couldn’t push the set list. Nothing was sent — try again.');
  }
  const result = publishResultSchema.safeParse(published);
  if (!result.success) {
    console.error('[set-lists/publish] unexpected publish result', { setListId });
    return fail(res, 500, 'PUBLISH_FAILED', 'Couldn’t confirm the push. Refresh to check its status.');
  }
  const { version, changed } = result.data;

  if (!changed) {
    res.status(200).json({ data: { version, changed: false, notified: 0, pushed: 0, pushFailed: 0 } });
    return;
  }

  const delivery = await deliverSetListPush(service, {
    actId,
    setListId,
    bookingId: row.booking_id,
    version,
    recipients,
    text: setListPushText({ name: row.name, version, venueName, showDate: showRow.show_date }),
  });

  console.info('[set-lists/publish] pushed', {
    setListId, actId, userId, version,
    recipients: recipients.length, notified: delivery.notified, pushed: delivery.push.sent, pushFailed: delivery.push.failed,
  });
  res.status(200).json({
    data: { version, changed: true, notified: delivery.notified, pushed: delivery.push.sent, pushFailed: delivery.push.failed },
  });
}
