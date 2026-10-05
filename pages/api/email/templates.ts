// pages/api/email/templates.ts
//
// Band email templates: a title, a subject and a body. No categories.
// Band admins only; the band always comes from the caller's profile.
//
//   GET                         → { templates: [{ id, name, subject, body, updated_at }] }
//   POST { name, subject, body, overwrite? }
//                               → 200 { template } | 409 { error, code: 'EXISTS' } when the title
//                                 is taken and overwrite isn't true
//   DELETE { id }               → { ok: true }

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getServiceClient } from '../../../lib/supabase';
import { requireBandAdmin } from '../../../lib/server/requireBandAdmin';
import { AppError, withHandler } from '../../../lib/apiError';

const TEMPLATE_COLS = 'id, name, subject, body, updated_at';

const saveSchema = z.object({
  name: z.string().trim().min(1, 'Give the template a title').max(120),
  subject: z.string().max(300).default(''),
  body: z.string().trim().min(1, 'The template is empty').max(50_000),
  overwrite: z.boolean().optional(),
});

const deleteSchema = z.object({ id: z.string().uuid() });

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message || 'Invalid request';
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const service = getServiceClient();
  const { actId, userId } = await requireBandAdmin(req, service);

  if (req.method === 'GET') {
    const { data, error } = await service
      .from('email_templates')
      .select(TEMPLATE_COLS)
      .eq('act_id', actId)
      .order('name', { ascending: true });
    if (error) throw new AppError(500, 'Could not load templates');
    return res.status(200).json({ templates: data ?? [] });
  }

  if (req.method === 'POST') {
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, firstIssue(parsed.error));
    const { name, subject, body, overwrite } = parsed.data;
    const now = new Date().toISOString();

    // Titles are unique per band, case-insensitively (matches the DB index).
    const { data: existing } = await service
      .from('email_templates')
      .select('id')
      .eq('act_id', actId)
      .ilike('name', name.replace(/[%_\\]/g, m => `\\${m}`))
      .maybeSingle();

    if (existing && !overwrite) {
      return res.status(409).json({ error: `A template called "${name}" already exists.`, code: 'EXISTS' });
    }

    if (existing) {
      const { data, error } = await service
        .from('email_templates')
        .update({ name, subject, body, updated_at: now })
        .eq('id', existing.id)
        .eq('act_id', actId)
        .select(TEMPLATE_COLS)
        .single();
      if (error) throw new AppError(500, 'Could not save the template');
      return res.status(200).json({ template: data });
    }

    const { data, error } = await service
      .from('email_templates')
      .insert({ act_id: actId, user_id: userId, name, subject, body, created_at: now, updated_at: now })
      .select(TEMPLATE_COLS)
      .single();
    if (error) throw new AppError(500, 'Could not save the template');
    return res.status(200).json({ template: data });
  }

  if (req.method === 'DELETE') {
    const parsed = deleteSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Template id required');
    const { error } = await service
      .from('email_templates')
      .delete()
      .eq('id', parsed.data.id)
      .eq('act_id', actId);
    if (error) throw new AppError(500, 'Could not delete the template');
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withHandler(handler);
