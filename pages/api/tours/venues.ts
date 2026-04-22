import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

async function getUser(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await getServiceClient().auth.getUser(token);
  return user;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const service = getServiceClient();
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { tour_id } = req.query;
    if (!tour_id) return res.status(400).json({ error: 'tour_id required' });

    const { data: tour } = await service.from('tours').select('id').eq('id', tour_id).eq('created_by', user.id).maybeSingle();
    if (!tour) return res.status(403).json({ error: 'Forbidden' });

    const { data, error } = await service
      .from('tour_venues')
      .select('*, venue:venues(id, name, city, state, capacity, venue_type, email, phone, website)')
      .eq('tour_id', tour_id)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { tour_id, venue_id } = req.body;
    if (!tour_id || !venue_id) return res.status(400).json({ error: 'tour_id and venue_id required' });

    const { data: tour } = await service.from('tours').select('id').eq('id', tour_id).eq('created_by', user.id).maybeSingle();
    if (!tour) return res.status(403).json({ error: 'Forbidden' });

    const { data, error } = await service.from('tour_venues').insert({
      tour_id,
      venue_id,
      status: 'target',
      added_by: user.id,
    }).select('*, venue:venues(id, name, city, state, capacity, venue_type, email, phone)').single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Venue already in pool' });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
  }

  if (req.method === 'PATCH') {
    const { id, status, notes } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });

    const { data: tv } = await service.from('tour_venues').select('tour_id').eq('id', id).maybeSingle();
    if (!tv) return res.status(404).json({ error: 'Not found' });

    const { data: tour } = await service.from('tours').select('id').eq('id', tv.tour_id).eq('created_by', user.id).maybeSingle();
    if (!tour) return res.status(403).json({ error: 'Forbidden' });

    const update: any = {};
    if (status !== undefined) update.status = status;
    if (notes !== undefined) update.notes = notes;

    const { data, error } = await service.from('tour_venues').update(update).eq('id', id)
      .select('*, venue:venues(id, name, city, state, capacity, venue_type, email, phone)').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });

    const { data: tv } = await service.from('tour_venues').select('tour_id').eq('id', id as string).maybeSingle();
    if (!tv) return res.status(404).json({ error: 'Not found' });

    const { data: tour } = await service.from('tours').select('id').eq('id', tv.tour_id).eq('created_by', user.id).maybeSingle();
    if (!tour) return res.status(403).json({ error: 'Forbidden' });

    const { error } = await service.from('tour_venues').delete().eq('id', id as string);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
