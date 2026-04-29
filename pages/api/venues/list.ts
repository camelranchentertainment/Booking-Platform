import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

// Returns all venues accessible to the agent:
// - venues they own directly (agent_id = user.id)
// - venues linked to tours they created (via tour_venues)
// - venues linked to tours for acts they manage (via acts.agent_id or acts.owner_id)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Get venues owned by this agent
  const { data: ownedVenues } = await service
    .from('venues')
    .select('*')
    .eq('agent_id', user.id)
    .order('name')
    .limit(500);

  const owned = ownedVenues || [];
  const ownedIds = new Set(owned.map((v: any) => v.id));

  // Get all tour IDs accessible to this agent:
  // 1. Tours created by this agent
  // 2. Tours for acts managed by this agent (agent_id or owner_id)
  const [agentToursRes, managedActsRes] = await Promise.all([
    service.from('tours').select('id').eq('created_by', user.id),
    service.from('acts').select('id').or(`agent_id.eq.${user.id},owner_id.eq.${user.id}`),
  ]);

  const createdTourIds = (agentToursRes.data || []).map((t: any) => t.id);
  const managedActIds  = (managedActsRes.data || []).map((a: any) => a.id);

  let managedActTourIds: string[] = [];
  if (managedActIds.length > 0) {
    const { data: actTours } = await service
      .from('tours')
      .select('id')
      .in('act_id', managedActIds);
    managedActTourIds = (actTours || []).map((t: any) => t.id);
  }

  const allTourIds = [...new Set([...createdTourIds, ...managedActTourIds])];

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
