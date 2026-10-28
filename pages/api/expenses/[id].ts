// pages/api/expenses/[id].ts
//
// PUT    → edit an active expense of the caller's band
// DELETE → ARCHIVE the expense (sets archived_at). Financial rows are never
//          physically deleted; archived ones are hidden from lists and totals.
//
// Service role (bypasses RLS): band admins / superadmin only, and the expense
// must belong to the band on the caller's profile. Any admin of the band may
// edit or archive the band's expenses, not only the one who entered them.
// Another band's expense answers 404 so ids can't be probed.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { AppError, withHandler } from '../../../lib/apiError';
import { requireBandAdmin } from '../../../lib/server/requireBandAdmin';
import { ownedBookingId, ownedTourId } from '../../../lib/server/actOwnership';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Builds the PUT update from the body, checking each field that was sent. */
async function buildUpdate(
  svc: ReturnType<typeof getServiceClient>,
  actId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Older expenses have no tour; an edit that leaves it empty keeps it that way.
  if (body.tour_id === null || body.tour_id === '') {
    updates.tour_id = null;
  } else if (body.tour_id !== undefined) {
    const tourId = await ownedTourId(svc, actId, body.tour_id);
    if (!tourId) throw new AppError(404, "That tour wasn't found for this band");
    updates.tour_id = tourId;
  }
  if (body.booking_id !== undefined) {
    if (body.booking_id === null || body.booking_id === '') {
      updates.booking_id = null;
    } else {
      const bookingId = await ownedBookingId(svc, actId, body.booking_id);
      if (!bookingId) throw new AppError(404, "That show wasn't found for this band");
      updates.booking_id = bookingId;
    }
  }
  if (body.expense_date !== undefined) {
    if (typeof body.expense_date !== 'string' || !ISO_DATE.test(body.expense_date)) {
      throw new AppError(400, 'expense_date must look like 2026-11-07');
    }
    updates.expense_date = body.expense_date;
  }
  if (body.category !== undefined) {
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    if (!category) throw new AppError(400, 'category required');
    updates.category = category;
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, 'amount must be above 0');
    updates.amount = amount;
  }
  if (body.notes !== undefined) {
    updates.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
  }
  return updates;
}

/**
 * PUT /api/expenses/:id, DELETE /api/expenses/:id (archive)
 *
 * @throws AppError 400 bad input, 401/403 auth, 404 not in the band, 405 method, 409 archived
 */
export default withHandler(async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== 'string' || !id) throw new AppError(400, 'id required');

  const svc = getServiceClient();
  const { actId } = await requireBandAdmin(req, svc);

  const { data: existing, error: loadErr } = await svc
    .from('expenses')
    .select('id, act_id, archived_at')
    .eq('id', id)
    .eq('act_id', actId)
    .maybeSingle();
  if (loadErr) {
    console.error('[expenses/:id] load failed', { id, error: loadErr.message });
    throw new AppError(500, 'The expense could not be loaded');
  }
  if (!existing) throw new AppError(404, 'Not found');

  if (req.method === 'PUT') {
    // Archived expenses are a closed record — they can't be edited.
    if (existing.archived_at) throw new AppError(409, 'This expense is archived and can no longer be edited.');
    const updates = await buildUpdate(svc, actId, (req.body ?? {}) as Record<string, unknown>);

    const { data, error } = await svc
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .eq('act_id', actId)
      .is('archived_at', null)
      .select()
      .single();
    if (error) {
      console.error('[expenses/:id PUT] update failed', { id, error: error.message });
      throw new AppError(500, 'The expense could not be saved');
    }
    res.status(200).json({ expense: data });
    return;
  }

  // Financial data is archived, never deleted: the row is kept for the record
  // and drops out of lists and totals (they filter archived_at is null).
  // Idempotent — archiving an already-archived expense is a no-op.
  if (req.method === 'DELETE') {
    if (existing.archived_at) {
      res.status(204).end();
      return;
    }
    const now = new Date().toISOString();
    const { error } = await svc
      .from('expenses')
      .update({ archived_at: now, updated_at: now })
      .eq('id', id)
      .eq('act_id', actId)
      .is('archived_at', null);
    if (error) {
      console.error('[expenses/:id DELETE] archive failed', { id, error: error.message });
      throw new AppError(500, 'The expense could not be archived');
    }
    res.status(204).end();
    return;
  }

  throw new AppError(405, 'Method not allowed');
});
