import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

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

export const EXPENSE_CATEGORIES = [
  'Gas / Mileage',
  'Hotel / Lodging',
  'Band Member Payments',
  'Food / Meals',
  'Equipment',
  'Other',
] as const;

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

  const svc = getServiceClient();

  const { data: profile } = await svc
    .from('user_profiles')
    .select('role, act_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return res.status(401).json({ error: 'Profile not found' });

  let userActId: string | null = profile.act_id;
  if (!userActId && (profile.role === 'act_admin' || profile.role === 'superadmin')) {
    const { data: owned } = await svc
      .from('acts')
      .select('id')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    userActId = owned?.id ?? null;
  }

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { tour_id, start_date, end_date, category } = req.query;

    let query = svc
      .from('expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('expense_date', { ascending: false });

    if (tour_id)    query = query.eq('tour_id', tour_id as string);
    if (category)   query = query.eq('category', category as string);
    if (start_date) query = query.gte('expense_date', start_date as string);
    if (end_date)   query = query.lte('expense_date', end_date as string);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ expenses: data || [] });
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { tour_id, booking_id, expense_date, category, amount, notes } = req.body as {
      tour_id: string;
      booking_id?: string | null;
      expense_date: string;
      category: string;
      amount: number;
      notes?: string | null;
    };

    if (!tour_id)      return res.status(400).json({ error: 'tour_id required' });
    if (!expense_date) return res.status(400).json({ error: 'expense_date required' });
    if (!category)     return res.status(400).json({ error: 'category required' });
    if (!amount || isNaN(Number(amount))) return res.status(400).json({ error: 'amount required' });

    const { data, error } = await svc
      .from('expenses')
      .insert({
        user_id:      user.id,
        act_id:       userActId,
        tour_id,
        booking_id:   booking_id ?? null,
        expense_date,
        category,
        amount:       Number(amount),
        notes:        notes ?? null,
        updated_at:   new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ expense: data });
  }

  return res.status(405).end();
}
