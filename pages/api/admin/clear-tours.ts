import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-admin-secret'] !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const service = getServiceClient();
  await service.from('tour_venues').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await service.from('tours').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  return res.status(200).json({ ok: true });
}
