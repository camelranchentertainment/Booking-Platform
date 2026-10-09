// pages/api/expenses/[id].ts
//
// PUT    → edit an active expense (owner only)
// DELETE → ARCHIVE the expense (sets archived_at). Financial rows are never
//          physically deleted; archived ones are hidden from lists and totals.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

async function getAuthedUser(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const svc = getServiceClient();
  const { data: { user } } = await svc.auth.getUser(token);
  return user ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id required' });

  const svc = getServiceClient();

  const { data: existing } = await svc
    .from('expenses')
    .select('id, user_id, archived_at')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' });

  // ── PUT ──────────────────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { tour_id, booking_id, expense_date, category, amount, notes } = req.body as {
      tour_id?: string;
      booking_id?: string | null;
      expense_date?: string;
      category?: string;
      amount?: number;
      notes?: string | null;
    };

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (tour_id !== undefined)      updates.tour_id      = tour_id;
    if (booking_id !== undefined)   updates.booking_id   = booking_id;
    if (expense_date !== undefined) updates.expense_date = expense_date;
    if (category !== undefined)     updates.category     = category;
    if (amount !== undefined)       updates.amount       = Number(amount);
    if (notes !== undefined)        updates.notes        = notes;

    // Archived expenses are a closed record — they can't be edited.
    if (existing.archived_at) return res.status(409).json({ error: 'This expense is archived and can no longer be edited.' });

    const { data, error } = await svc
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .is('archived_at', null)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ expense: data });
  }

  // ── DELETE → archive ─────────────────────────────────────────────────────────
  // Financial data is archived, never deleted: the row is kept for the record
  // and drops out of lists and totals (they filter archived_at is null).
  // Idempotent — archiving an already-archived expense is a no-op.
  if (req.method === 'DELETE') {
    if (existing.archived_at) return res.status(204).end();
    const now = new Date().toISOString();
    const { error } = await svc
      .from('expenses')
      .update({ archived_at: now, updated_at: now })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('archived_at', null);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).end();
}
