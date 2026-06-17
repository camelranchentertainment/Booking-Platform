import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Verify the user is a band_admin and get their act_id
  const { data: profile } = await service
    .from('profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.act_id || !['band_admin', 'superadmin'].includes(profile.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await service
    .from('acts')
    .update({
      google_access_token:  null,
      google_refresh_token: null,
      gmail_address:        null,
      gmail_connected_at:   null,
    })
    .eq('id', profile.act_id);

  return res.status(200).json({ ok: true });
}
