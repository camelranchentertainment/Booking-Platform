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
    .select('id, user_id')
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

    const { data, error } = await svc
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ expense: data });
  }

  // ── DELETE ───────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { error } = await svc.from('expenses').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).end();
}
