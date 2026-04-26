import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

async function getAuthedSuperadmin(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await service.from('user_profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'superadmin' ? user : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const admin = await getAuthedSuperadmin(req);
  if (!admin) return res.status(403).json({ error: 'Superadmin only' });

  const mapsKey = await getSetting('google_maps_api_key').catch(() => null);

  return res.json({
    supabase:       true,
    stripe:         !!process.env.STRIPE_SECRET_KEY,
    resend:         !!process.env.RESEND_API_KEY,
    googleMaps:     !!(process.env.GOOGLE_MAPS_API_KEY || mapsKey),
    googleCalendar: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    gitHash:        process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || null,
  });
}
