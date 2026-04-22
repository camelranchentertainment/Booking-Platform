import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export type PublicAct = {
  id: string;
  act_name: string;
  genre: string | null;
  bio: string | null;
  logo_url: string | null;
  instagram: string | null;
  website: string | null;
  confirmed_count: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const service = getServiceClient();

  // Fetch active acts
  const { data: acts, error } = await service
    .from('acts')
    .select('id, act_name, genre, bio, logo_url, instagram, website')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(6);

  if (error) return res.status(500).json({ error: error.message });
  if (!acts?.length) return res.json([]);

  // Count confirmed/completed bookings per act for ranking
  const ids = acts.map((a: any) => a.id);
  const { data: counts } = await service
    .from('bookings')
    .select('act_id')
    .in('act_id', ids)
    .in('status', ['confirmed', 'advancing', 'completed']);

  const countMap: Record<string, number> = {};
  for (const row of counts || []) {
    countMap[row.act_id] = (countMap[row.act_id] || 0) + 1;
  }

  const result: PublicAct[] = acts
    .map((a: any) => ({ ...a, confirmed_count: countMap[a.id] || 0 }))
    .sort((a: PublicAct, b: PublicAct) => b.confirmed_count - a.confirmed_count)
    .slice(0, 3);

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  return res.json(result);
}
