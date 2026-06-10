import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

// email_templates live columns: id, name, subject, body, variables, created_at, updated_at, user_id, band_id
// We store act_id in band_id (no FK constraint on that column).

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const service = getServiceClient();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // ── GET: list all templates for act, or fetch one by name ──────────────
  if (req.method === 'GET') {
    const { actId, category } = req.query;
    if (!actId) return res.status(400).json({ error: 'actId required' });

    // List all templates for this act (plus global where act_id IS NULL)
    if (!category) {
      const { data } = await service.from('email_templates')
        .select('id, category, subject, body, updated_at')
        .or(`act_id.eq.${actId as string},act_id.is.null`)
        .order('category', { ascending: true });
      return res.status(200).json({ templates: data || [] });
    }

    if (name) {
      // Fetch specific template by name
      const { data } = await service
        .from('email_templates')
        .select('id, name, subject, body, updated_at')
        .eq('band_id', actId as string)
        .eq('name', name as string)
        .maybeSingle();
      return res.status(200).json({ template: data || null });
    }

    // List all templates for this act
    const { data } = await service
      .from('email_templates')
      .select('id, name, subject, body, updated_at')
      .eq('band_id', actId as string)
      .order('updated_at', { ascending: false });

    return res.status(200).json({ templates: data || [] });
  }

  // ── POST: save (upsert by name + act) ─────────────────────────────────
  if (req.method === 'POST') {
    const { actId, name, subject, body } = req.body;
    if (!actId || !name || !body) return res.status(400).json({ error: 'actId, name, body required' });

    const now = new Date().toISOString();

    // Check if template with same name already exists for this act
    const { data: existing } = await service
      .from('email_templates')
      .select('id')
      .eq('band_id', actId)
      .eq('name', name)
      .maybeSingle();

    if (existing) {
      const { data, error } = await service
        .from('email_templates')
        .update({ subject: subject || '', body, updated_at: now })
        .eq('id', existing.id)
        .select('id, name, subject, body, updated_at')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ template: data });
    } else {
      const { data, error } = await service
        .from('email_templates')
        .insert({
          band_id:    actId,
          user_id:    user.id,
          name,
          subject:    subject || '',
          body,
        })
        .select('id, name, subject, body, updated_at')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ template: data });
    }
  }

  // ── DELETE: remove template by name ───────────────────────────────────
  if (req.method === 'DELETE') {
    const { actId, name } = req.body;
    if (!actId || !name) return res.status(400).json({ error: 'actId and name required' });
    await service
      .from('email_templates')
      .delete()
      .eq('band_id', actId)
      .eq('name', name);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
