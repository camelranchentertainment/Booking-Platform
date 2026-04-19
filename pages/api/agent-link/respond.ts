// POST /api/agent-link/respond
// Band owner accepts or declines an agent link request
// Body: { linkId, action: 'accept' | 'decline' }

import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization?.replace('Bearer ', '');
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getServiceClient();
  const { data: { user } } = await supabase.auth.getUser(authHeader);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { linkId, action } = req.body;
  if (!linkId || !['accept', 'decline'].includes(action)) {
    return res.status(400).json({ error: 'linkId and action (accept|decline) required' });
  }

  // Verify the band owns the act in this link
  const { data: link } = await supabase
    .from('agent_act_links')
    .select('id, act_id, agent_id, status')
    .eq('id', linkId)
    .maybeSingle();

  if (!link) return res.status(404).json({ error: 'Link not found' });
  if (link.status !== 'pending') return res.status(409).json({ error: 'Link already resolved' });

  const { data: act } = await supabase.from('acts').select('owner_id').eq('id', link.act_id).maybeSingle();
  if (act?.owner_id !== user.id) return res.status(403).json({ error: 'Not authorized to respond to this link' });

  if (action === 'accept') {
    await supabase.from('agent_act_links').update({
      status:      'active',
      accepted_at: new Date().toISOString(),
    }).eq('id', linkId);

    // Set acts.agent_id so the agent has full visibility
    await supabase.from('acts').update({ agent_id: link.agent_id }).eq('id', link.act_id);

    return res.status(200).json({ ok: true, status: 'active' });
  } else {
    await supabase.from('agent_act_links').update({ status: 'declined' }).eq('id', linkId);
    return res.status(200).json({ ok: true, status: 'declined' });
  }
}
