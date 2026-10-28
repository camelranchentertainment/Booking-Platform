// pages/api/expenses/index.ts
//
// GET  → the band's active expenses (any admin's, not only the caller's)
// POST → add an expense to the band
//
// Service role (bypasses RLS), so every request is checked here:
//   * band admins / superadmin only — members never see money (CLAUDE.md);
//   * the band always comes from the caller's profile (requireBandAdmin),
//     never from the request;
//   * a tour or booking id from the body must belong to that band.
// Archived expenses are kept for the record and never listed or totalled.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { AppError, withHandler } from '../../../lib/apiError';
import { requireBandAdmin } from '../../../lib/server/requireBandAdmin';
import { ownedBookingId, ownedTourId } from '../../../lib/server/actOwnership';

export type Expense = {
  id: string;
  user_id: string;
  act_id: string | null;
  tour_id: string | null;
  booking_id: string | null;
  expense_date: string;
  category: string;
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A query-string value as one string, or undefined. */
function one(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

/**
 * GET /api/expenses?tour_id&start_date&end_date&category
 * POST /api/expenses { tour_id, booking_id?, expense_date, category, amount, notes? }
 *
 * @throws AppError 400 bad input, 401/403 auth, 404 tour/booking not in the band, 405 method
 */
export default withHandler(async function handler(req: NextApiRequest, res: NextApiResponse) {
  const svc = getServiceClient();
  const { userId, actId } = await requireBandAdmin(req, svc);

  if (req.method === 'GET') {
    const tourId = one(req.query.tour_id);
    const category = one(req.query.category);
    const start = one(req.query.start_date);
    const end = one(req.query.end_date);
    if ((start && !ISO_DATE.test(start)) || (end && !ISO_DATE.test(end))) {
      throw new AppError(400, 'Dates must look like 2026-11-07');
    }

    let query = svc
      .from('expenses')
      .select('*')
      .eq('act_id', actId)
      .is('archived_at', null)
      .order('expense_date', { ascending: false });
    if (tourId) query = query.eq('tour_id', tourId);
    if (category) query = query.eq('category', category);
    if (start) query = query.gte('expense_date', start);
    if (end) query = query.lte('expense_date', end);

    const { data, error } = await query;
    if (error) {
      console.error('[expenses GET] load failed', { actId, error: error.message });
      throw new AppError(500, 'Expenses could not be loaded');
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({ expenses: data ?? [] });
    return;
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const amount = Number(body.amount);
    const expenseDate = typeof body.expense_date === 'string' ? body.expense_date : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    if (!body.tour_id) throw new AppError(400, 'tour_id required');
    if (!ISO_DATE.test(expenseDate)) throw new AppError(400, 'expense_date required (YYYY-MM-DD)');
    if (!category) throw new AppError(400, 'category required');
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, 'amount required');

    const tourId = await ownedTourId(svc, actId, body.tour_id);
    if (!tourId) throw new AppError(404, "That tour wasn't found for this band");
    let bookingId: string | null = null;
    if (body.booking_id) {
      bookingId = await ownedBookingId(svc, actId, body.booking_id);
      if (!bookingId) throw new AppError(404, "That show wasn't found for this band");
    }

    const { data, error } = await svc
      .from('expenses')
      .insert({
        user_id: userId,
        act_id: actId,
        tour_id: tourId,
        booking_id: bookingId,
        expense_date: expenseDate,
        category,
        amount,
        notes,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) {
      console.error('[expenses POST] insert failed', { actId, error: error.message });
      throw new AppError(500, 'The expense could not be saved');
    }
    res.status(201).json({ expense: data });
    return;
  }

  throw new AppError(405, 'Method not allowed');
});
