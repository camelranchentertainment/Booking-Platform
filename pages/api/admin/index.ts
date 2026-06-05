import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

async function getAuthedSuperadmin(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await service
    .from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'superadmin' ? user : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await getAuthedSuperadmin(req);
  if (!user) return res.status(403).json({ error: 'Superadmin only' });

  const service = getServiceClient();

  const [
    profilesRes,
    actsRes,
    venuesRes,
    bookingsRes,
    notifsRes,
  ] = await Promise.all([
    service.from('profiles').select('id, role, subscription_status, subscription_tier, created_at', { count: 'exact' }),
    service.from('acts').select('id, act_name, created_at, is_active', { count: 'exact' }),
    service.from('venues').select('id', { count: 'exact', head: true }),
    service.from('bookings').select('id, status', { count: 'exact' }),
    service.from('notifications')
      .select('id, type, message, created_at, act_id, acts:act_id(act_name)')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const profiles = (profilesRes.data || []) as any[];
  const acts     = (actsRes.data || []) as any[];
  const bookings = (bookingsRes.data || []) as any[];

  const activeActs    = profiles.filter(p => p.subscription_status === 'active').length;
  const trialActs     = profiles.filter(p => p.subscription_status === 'trialing').length;
  const cancelledActs = profiles.filter(p => p.subscription_status === 'cancelled').length;
  const mrr           = activeActs * 18;

  const bandAdmins = profiles.filter(p => p.role === 'band_admin').length;
  const members    = profiles.filter(p => p.role === 'member').length;

  const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length;

  const recentSignups = acts
    .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10)
    .map((a: any) => ({
      id:        a.id,
      act_name:  a.act_name,
      created_at: a.created_at,
      is_active: a.is_active,
    }));

  return res.status(200).json({
    acts: {
      total:     acts.length,
      active:    activeActs,
      trial:     trialActs,
      cancelled: cancelledActs,
    },
    users: {
      total:       profiles.length,
      band_admins: bandAdmins,
      members,
    },
    venues: { total: venuesRes.count || 0 },
    bookings: {
      total:     bookings.length,
      confirmed: confirmedBookings,
    },
    mrr,
    recentSignups,
    recentActivity: notifsRes.data || [],
  });
}
