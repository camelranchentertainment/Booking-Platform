// POST /api/tours/delete
import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

async function getUser(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await getServiceClient().auth.getUser(token);
  return user;
}

async function canAccessTour(service: any, tourId: string, userId: string): Promise<boolean> {
  const { data: tour } = await service.from('tours').select('id, act_id, created_by').eq('id', tourId).maybeSingle();
  if (!tour) return false;
  if (tour.created_by === userId) return true;
  const { data: act } = await service.from('acts').select('id').eq('id', tour.act_id).eq('owner_id', userId).maybeSingle();
  return !!act;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const service = getServiceClient();
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { tourId } = req.body;
  if (!tourId) return res.status(400).json({ error: 'tourId required' });

  if (!await canAccessTour(service, tourId, user.id)) return res.status(403).json({ error: 'Forbidden' });

  const { error } = await service.from('tours').delete().eq('id', tourId);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
