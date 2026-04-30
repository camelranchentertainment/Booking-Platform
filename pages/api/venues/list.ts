import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: ownedVenues } = await service
    .from('venues')
    .select('*')
    .eq('agent_id', user.id)
    .order('name')
    .limit(500);

  const owned = ownedVenues || [];
  const ownedIds = new Set(owned.map((v: any) => v.id));

  const [agentToursRes, managedActsRes] = await Promise.all([
    service.from('tours').select('id').eq('created_by', user.id),
    service.from('acts').select('id').eq('owner_id', user.id),
  ]);

  const createdTourIds = (agentToursRes.data || []).map((t: any) => t.id);
  const ownedActIds    = (managedActsRes.data || []).map((a: any) => a.id);

  let ownedActTourIds: string[] = [];
  if (ownedActIds.length > 0) {
    const { data: actTours } = await service
      .from('tours')
      .select('id')
      .in('act_id', ownedActIds);
    ownedActTourIds = (actTours || []).map((t: any) => t.id);
  }

  const allTourIds = [...new Set([...createdTourIds, ...ownedActTourIds])];

  let extraVenues: any[] = [];
  if (allTourIds.length > 0) {
    const { data: tvLinks } = await service
      .from('tour_venues')
      .select('venue_id')
      .in('tour_id', allTourIds);

    const extraIds = [...new Set(
      (tvLinks || []).map((tv: any) => tv.venue_id).filter((id: string) => id && !ownedIds.has(id))
    )];

    if (extraIds.length > 0) {
      const { data } = await service
        .from('venues')
        .select('*')
        .in('id', extraIds);
      extraVenues = data || [];
    }
  }

  const all = [...owned, ...extraVenues].sort((a, b) => a.name.localeCompare(b.name));
  return res.status(200).json(all);
}
