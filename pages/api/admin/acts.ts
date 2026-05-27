import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

async function getAuthedSuperadmin(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await service
    .from('user_profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'superadmin' ? user : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await getAuthedSuperadmin(req);
  if (!user) return res.status(403).json({ error: 'Superadmin only' });

  const service = getServiceClient();
  const { page = '1', limit = '25', search = '', status } = req.query;
  const pageNum  = Math.max(1, parseInt(page as string, 10) || 1);
  const pageSize = Math.min(100, parseInt(limit as string, 10) || 25);
  const offset   = (pageNum - 1) * pageSize;

  let actsQuery: any = service
    .from('acts')
    .select('id, act_name, created_at, owner_id, is_active', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (search) {
    actsQuery = actsQuery.ilike('act_name', `%${search}%`);
  }

  const { data: acts, count, error } = await actsQuery.range(offset, offset + pageSize - 1);
  if (error) return res.status(500).json({ error: error.message });

  const actIds   = (acts || []).map((a: any) => a.id);
  const ownerIds = [...new Set((acts || []).map((a: any) => a.owner_id).filter(Boolean))];

  const [profilesRes, venueCountRes, bookingCountRes] = await Promise.all([
    ownerIds.length > 0
      ? service.from('user_profiles')
          .select('id, email, display_name, subscription_status, subscription_tier')
          .in('id', ownerIds as string[])
      : Promise.resolve({ data: [] }),
    actIds.length > 0
      ? service.from('venues').select('id, act_id').in('act_id', actIds)
      : Promise.resolve({ data: [] }),
    actIds.length > 0
      ? service.from('bookings').select('id, act_id').in('act_id', actIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap: Record<string, any> = {};
  for (const p of (profilesRes.data || []) as any[]) profileMap[p.id] = p;

  const venuesByAct: Record<string, number> = {};
  for (const v of (venueCountRes.data || []) as any[]) {
    if (v.act_id) venuesByAct[v.act_id] = (venuesByAct[v.act_id] || 0) + 1;
  }

  const bookingsByAct: Record<string, number> = {};
  for (const b of (bookingCountRes.data || []) as any[]) {
    if (b.act_id) bookingsByAct[b.act_id] = (bookingsByAct[b.act_id] || 0) + 1;
  }

  const enriched = (acts || []).map((a: any) => {
    const owner = a.owner_id ? profileMap[a.owner_id] : null;
    return {
      id:                  a.id,
      act_name:            a.act_name,
      created_at:          a.created_at,
      is_active:           a.is_active,
      band_admin_email:    owner?.email || null,
      band_admin_name:     owner?.display_name || null,
      subscription_status: owner?.subscription_status || null,
      subscription_tier:   owner?.subscription_tier || null,
      venue_count:         venuesByAct[a.id] || 0,
      booking_count:       bookingsByAct[a.id] || 0,
    };
  });

  return res.status(200).json({
    acts:  enriched,
    total: count || 0,
    page:  pageNum,
    limit: pageSize,
  });
}
