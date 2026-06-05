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
    .from('profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.act_id) return res.status(403).json({ error: 'No act linked' });
  if (profile.role === 'member') return res.status(403).json({ error: 'Not authorized' });

  const { data: bookings, error } = await service
    .from('bookings')
    .select('id, show_date, deal_type, agreed_amount, fee, actual_amount_received, payment_status, status, venue:venues(name, city, state)')
    .eq('act_id', profile.act_id)
    .neq('status', 'cancelled')
    .order('show_date', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const rows = (bookings || []) as any[];
  const today = new Date().toISOString().split('T')[0];

  const completed = rows.filter(b => b.status === 'completed');
  const confirmed = rows.filter(b => b.status === 'confirmed' && b.show_date && b.show_date > today);

  const totalEarned = completed.reduce((s: number, b: any) =>
    s + (Number(b.actual_amount_received) || 0), 0);

  const totalPending = confirmed.reduce((s: number, b: any) =>
    s + (Number(b.agreed_amount ?? b.fee) || 0), 0);

  const totalShows = completed.length;
  const avgPerShow = totalShows > 0 ? Math.round(totalEarned / totalShows) : 0;

  const depositsPending = rows.filter(b =>
    b.status === 'confirmed' && b.payment_status === 'pending'
  ).length;

  // By month (last 12 months)
  const byMonthMap: Record<string, { month: number; year: number; earnings: number; shows: number }> = {};
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 11);
  cutoff.setDate(1);

  for (const b of completed) {
    if (!b.show_date) continue;
    const d = new Date(b.show_date + 'T00:00:00');
    if (d < cutoff) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonthMap[key]) byMonthMap[key] = { month: d.getMonth() + 1, year: d.getFullYear(), earnings: 0, shows: 0 };
    byMonthMap[key].earnings += Number(b.actual_amount_received) || 0;
    byMonthMap[key].shows++;
  }
  const byMonth = Object.entries(byMonthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  // By pay type
  const byPayType: Record<string, number> = {};
  for (const b of rows) {
    const t = b.deal_type || 'other';
    byPayType[t] = (byPayType[t] || 0) + 1;
  }

  // By state
  const stateMap: Record<string, { state: string; earnings: number; shows: number }> = {};
  for (const b of completed) {
    const st = (b.venue as any)?.state || 'Unknown';
    if (!stateMap[st]) stateMap[st] = { state: st, earnings: 0, shows: 0 };
    stateMap[st].earnings += Number(b.actual_amount_received) || 0;
    stateMap[st].shows++;
  }
  const byState = Object.values(stateMap)
    .map(s => ({ ...s, avgPay: s.shows > 0 ? Math.round(s.earnings / s.shows) : 0 }))
    .sort((a, b) => b.earnings - a.earnings);

  return res.status(200).json({
    summary: { totalEarned, totalPending, avgPerShow, totalShows, depositsPending },
    byMonth,
    byPayType,
    byState,
    bookings: rows,
  });
}
