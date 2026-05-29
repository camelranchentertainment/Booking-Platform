import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await service
    .from('user_profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.act_id) return res.status(400).json({ error: 'No act associated with account' });

  const actId = profile.act_id;
  const today = new Date().toISOString().split('T')[0];

  // Fetch tour IDs for this act (needed to scope tour_venues)
  const { data: tours } = await service
    .from('tours')
    .select('id')
    .eq('act_id', actId)
    .neq('status', 'cancelled');

  const tourIds = (tours ?? []).map((t: any) => t.id);

  const [tvTargetRes, tvPipelineRes, confirmedRes, toursRes, emailRes] = await Promise.all([
    tourIds.length > 0
      ? service.from('tour_venues').select('id', { count: 'exact', head: true })
          .in('tour_id', tourIds).eq('status', 'target')
      : Promise.resolve({ count: 0 }),

    tourIds.length > 0
      ? service.from('tour_venues').select('status')
          .in('tour_id', tourIds)
          .in('status', ['pitched', 'waiting', 'follow_up'])
      : Promise.resolve({ data: [] }),

    service.from('bookings').select('id', { count: 'exact', head: true })
      .eq('act_id', actId).eq('status', 'confirmed').gt('show_date', today),

    service.from('tours').select('id', { count: 'exact', head: true })
      .eq('act_id', actId).in('status', ['planning', 'active']),

    service.from('email_log').select('id', { count: 'exact', head: true })
      .eq('act_id', actId),
  ]);

  return res.status(200).json({
    targets:         (tvTargetRes as any).count ?? 0,
    inPipeline:      ((tvPipelineRes as any).data ?? []).length,
    confirmedShows:  (confirmedRes as any).count ?? 0,
    activeTours:     (toursRes as any).count ?? 0,
    emailsSent:      (emailRes as any).count ?? 0,
  });
}
