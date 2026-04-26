import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

async function getAuthedUser(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const svc = getServiceClient();
  const { data: { user } } = await svc.auth.getUser(token);
  return user ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id required' });

  const svc = getServiceClient();

  // ── PUT — update content or visibility ──────────────────────────────────────
  if (req.method === 'PUT') {
    const { content, visibility } = req.body as {
      content?: string;
      visibility?: string;
    };

    if (visibility !== undefined && !['agent_only', 'band_admin', 'all_members'].includes(visibility)) {
      return res.status(400).json({ error: 'Invalid visibility' });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (content  !== undefined) updates.content    = content;
    if (visibility !== undefined) updates.visibility = visibility;

    const { data, error } = await svc
      .from('daily_notes')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id) // ownership guard
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data)  return res.status(404).json({ error: 'Note not found or not yours' });
    return res.json({ note: data });
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { error } = await svc
      .from('daily_notes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id); // ownership guard

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).end();
}
