// POST /api/agent-link/send
// Agent sends a link request to a band by email
// Creates agent_act_links row; band accepts via /api/agent-link/accept

import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization?.replace('Bearer ', '');
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getServiceClient();
  const { data: { user } } = await supabase.auth.getUser(authHeader);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'agent') return res.status(403).json({ error: 'Only agents can send link requests' });

  const { actId, message, permissions = 'view' } = req.body;
  if (!actId) return res.status(400).json({ error: 'actId required' });

  // Verify act exists
  const { data: act } = await supabase.from('acts').select('id, act_name, owner_id, agent_id').eq('id', actId).maybeSingle();
  if (!act) return res.status(404).json({ error: 'Band not found' });
  // Allow linking even when owner_id is null (agent created the act and is now inviting the band admin)
  if (act.agent_id === user.id && !act.owner_id) return res.status(400).json({ error: 'You created this band — invite the band admin via act invitations instead' });

  // Create or update link
  const { data: link, error } = await supabase.from('agent_act_links').upsert({
    agent_id:    user.id,
    act_id:      actId,
    status:      'pending',
    permissions,
    message:     message || null,
  }, { onConflict: 'agent_id,act_id' }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, token: link.token, linkId: link.id });
}
