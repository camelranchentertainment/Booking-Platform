import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await service
    .from('user_profiles')
    .select('act_id')
    .eq('id', user.id)
    .single();

  if (!profile?.act_id) return res.status(403).json({ error: 'No act linked' });

  const { state, year, rating, page = '1', limit = '20' } = req.query;
  const pageNum  = Math.max(1, parseInt(page as string, 10) || 1);
  const pageSize = Math.min(100, parseInt(limit as string, 10) || 20);
  const offset   = (pageNum - 1) * pageSize;
  const today    = new Date().toISOString().split('T')[0];

  let query: any = service
    .from('bookings')
    .select(`
      id, show_date, deal_type, agreed_amount, fee,
      actual_amount_received, payment_status, status,
      post_show_notes, rebook_flag, issue_notes,
      rating, attendance, would_return, venue_feedback,
      venue:venues(id, name, city, state)
    `, { count: 'exact' })
    .eq('act_id', profile.act_id)
    .eq('status', 'completed')
    .lt('show_date', today)
    .order('show_date', { ascending: false });

  if (state) query = query.eq('venue.state' as any, state as string);

  if (year) {
    query = query
      .gte('show_date', `${year}-01-01`)
      .lte('show_date', `${year}-12-31`);
  }

  if (rating) {
    query = query.gte('rating', parseInt(rating as string, 10));
  }

  const { data, count, error } = await query.range(offset, offset + pageSize - 1);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    bookings: data || [],
    total: count || 0,
    page: pageNum,
    limit: pageSize,
  });
}
