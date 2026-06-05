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

  const { data: act } = await service
    .from('acts')
    .select('act_name')
    .eq('id', profile.act_id)
    .single();

  const { data: bookings } = await service
    .from('bookings')
    .select(`
      id, show_date, deal_type, agreed_amount, fee,
      actual_amount_received, payment_status, status,
      rating, attendance, would_return, post_show_notes,
      venue:venues(name, city, state)
    `)
    .eq('act_id', profile.act_id)
    .neq('status', 'cancelled')
    .order('show_date', { ascending: false });

  const rows = (bookings || []) as any[];
  const headers = [
    'Date', 'Venue', 'City', 'State', 'Pay Type',
    'Agreed Amount', 'Final Payment Received', 'Variance',
    'Attendance', 'Rating', 'Would Return', 'Notes',
  ];

  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const lines = rows.map(b => {
    const agreed = Number(b.agreed_amount ?? b.fee) || 0;
    const final  = Number(b.actual_amount_received) || 0;
    const variance = b.actual_amount_received != null ? final - agreed : '';
    return [
      esc(b.show_date || ''),
      esc((b.venue as any)?.name || ''),
      esc((b.venue as any)?.city || ''),
      esc((b.venue as any)?.state || ''),
      esc(b.deal_type || ''),
      esc(agreed || ''),
      esc(b.actual_amount_received ?? ''),
      esc(variance),
      esc(b.attendance ?? ''),
      esc(b.rating ?? ''),
      esc(b.would_return != null ? (b.would_return ? 'Yes' : 'No') : ''),
      esc(b.post_show_notes || ''),
    ].join(',');
  });

  const csv = [headers.map(esc).join(','), ...lines].join('\n');
  const actName = (act?.act_name || 'act').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const date = new Date().toISOString().split('T')[0];

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="financials-${actName}-${date}.csv"`);
  return res.status(200).send(csv);
}
