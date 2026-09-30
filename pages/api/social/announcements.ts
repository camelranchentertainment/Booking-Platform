import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getServiceClient } from '../../../lib/supabase';
import { AppError, withHandler } from '../../../lib/apiError';
import { requireBandAdmin } from '../../../lib/server/requireBandAdmin';
import type { SocialAnnouncement } from '../../../lib/types';

const VALID_STATUSES = ['ready', 'drafting', 'posted', 'dismissed', 'active'] as const;
type StatusParam = (typeof VALID_STATUSES)[number];

const PatchSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
  action: z.enum(['dismiss', 'restore']),
});

function err(code: string, message: string) {
  return { error: { code, message } };
}

/**
 * GET  /api/social/announcements?status=active|ready|drafting|posted|dismissed
 *   Returns up to 100 of the caller's act's announcements joined with booking
 *   (show_date, venue) and act (act_name), ordered by show_date asc.
 *   "active" (the default) returns ready + drafting together.
 *
 * PATCH /api/social/announcements
 *   Body: { id: uuid, action: "dismiss" | "restore" }
 *   dismiss  — moves ready/drafting to dismissed(user).
 *   restore  — reopens a user-dismissed card when the booking is still confirmed.
 */
export default withHandler(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json(err('METHOD_NOT_ALLOWED', 'Method not allowed'));
  }

  const svc = getServiceClient();

  let ctx: Awaited<ReturnType<typeof requireBandAdmin>>;
  try {
    ctx = await requireBandAdmin(req, svc);
  } catch (e) {
    if (e instanceof AppError) {
      const code = e.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN';
      return res.status(e.statusCode).json(err(code, e.message));
    }
    throw e;
  }

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const rawStatus = (req.query.status as string | undefined) ?? 'active';
    if (!(VALID_STATUSES as readonly string[]).includes(rawStatus)) {
      return res.status(400).json(
        err('INVALID_STATUS', `status must be one of: ${VALID_STATUSES.join(', ')}`),
      );
    }
    const statusParam = rawStatus as StatusParam;

    const { data, error: fetchErr } = await svc
      .from('social_announcements')
      .select(
        '*, booking:bookings(id, show_date, status, door_time, set_time, venue:venues(name, city, state)), act:acts(act_name)',
      )
      .eq('act_id', ctx.actId)
      .in('status', statusParam === 'active' ? ['ready', 'drafting'] : [statusParam])
      .order('show_date', { foreignTable: 'bookings', ascending: true })
      .limit(100);

    if (fetchErr) throw new Error(`social_announcements fetch: ${fetchErr.message}`);

    return res.status(200).json({ data: (data ?? []) as SocialAnnouncement[] });
  }

  // ── PATCH ─────────────────────────────────────────────────────────────────
  const parse = PatchSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json(
      err('INVALID_BODY', parse.error.issues[0]?.message ?? 'Invalid request body'),
    );
  }
  const { id, action } = parse.data;

  const { data: row, error: rowErr } = await svc
    .from('social_announcements')
    .select('id, status, dismissed_reason, booking_id')
    .eq('id', id)
    .eq('act_id', ctx.actId)
    .single();

  if (rowErr || !row) {
    return res.status(404).json(err('NOT_FOUND', 'Announcement not found'));
  }

  if (action === 'dismiss') {
    if (row.status !== 'ready' && row.status !== 'drafting') {
      return res.status(409).json(
        err('INVALID_TRANSITION', `Cannot dismiss from status '${row.status}'`),
      );
    }
    const { error: updateErr } = await svc
      .from('social_announcements')
      .update({ status: 'dismissed', dismissed_reason: 'user' })
      .eq('id', id);
    if (updateErr) throw new Error(`dismiss update: ${updateErr.message}`);
    return res.status(200).json({ ok: true });
  }

  // action === 'restore'
  if (row.status !== 'dismissed' || row.dismissed_reason !== 'user') {
    return res.status(409).json(
      err('INVALID_TRANSITION', 'Can only restore a user-dismissed announcement'),
    );
  }

  const { data: booking, error: bookingErr } = await svc
    .from('bookings')
    .select('status')
    .eq('id', row.booking_id)
    .single();

  if (bookingErr || !booking || booking.status !== 'confirmed') {
    return res.status(409).json(
      err('INVALID_TRANSITION', 'Cannot restore: booking is no longer confirmed'),
    );
  }

  const { error: restoreErr } = await svc
    .from('social_announcements')
    .update({ status: 'ready', dismissed_reason: null })
    .eq('id', id);
  if (restoreErr) throw new Error(`restore update: ${restoreErr.message}`);
  return res.status(200).json({ ok: true });
});
