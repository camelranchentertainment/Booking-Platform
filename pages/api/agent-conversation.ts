import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../lib/supabase';

async function getAuthedUser(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const svc = getServiceClient();
  const { data: { user } } = await svc.auth.getUser(token);
  return user ?? null;
}

// Keep saved history bounded — same discipline as the Help Center's message trimming.
const MAX_STORED_MESSAGES = 40;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const svc = getServiceClient();
  const { data: profile } = await svc.from('profiles').select('act_id').eq('id', user.id).single();
  const actId = profile?.act_id ?? null;

  if (req.method === 'GET') {
    const { data, error } = await svc
      .from('agent_conversations')
      .select('messages, updated_at')
      .eq('user_id', user.id)
      .eq('act_id', actId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ messages: data?.messages ?? [], updated_at: data?.updated_at ?? null });
  }

  if (req.method === 'PUT') {
    const { messages } = req.body as { messages?: Array<{ role: string; content: string }> };
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);
    const { error } = await svc
      .from('agent_conversations')
      .upsert(
        { user_id: user.id, act_id: actId, messages: trimmed, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,act_id' }
      );
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { error } = await svc
      .from('agent_conversations')
      .delete()
      .eq('user_id', user.id)
      .eq('act_id', actId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
