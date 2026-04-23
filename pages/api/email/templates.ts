import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const service = getServiceClient();

  // Verify auth
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { actId, category } = req.query;
    if (!actId || !category) return res.status(400).json({ error: 'actId and category required' });

    const { data } = await service.from('email_templates')
      .select('id, subject, body, updated_at')
      .eq('agent_id', user.id)
      .eq('act_id', actId as string)
      .eq('category', category as string)
      .maybeSingle();

    return res.status(200).json({ template: data || null });
  }

  if (req.method === 'POST') {
    const { actId, category, subject, body } = req.body;
    if (!actId || !category || !body) return res.status(400).json({ error: 'actId, category, body required' });

    const { data, error } = await service.from('email_templates')
      .upsert({
        agent_id:   user.id,
        act_id:     actId,
        category,
        subject:    subject || null,
        body,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'agent_id,act_id,category' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ template: data });
  }

  if (req.method === 'DELETE') {
    const { actId, category } = req.body;
    await service.from('email_templates')
      .delete()
      .eq('agent_id', user.id)
      .eq('act_id', actId)
      .eq('category', category);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
