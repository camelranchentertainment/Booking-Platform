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
import { TEMPLATE_COLS, TemplateExistsError, saveTemplate, templateSaveSchema } from '../../../lib/server/emailTemplates';

const saveSchema = templateSaveSchema.extend({ overwrite: z.boolean().optional() });

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
    const { overwrite, ...input } = parsed.data;
    try {
      const { template } = await saveTemplate(service, actId, userId, input, { overwrite });
      return res.status(200).json({ template });
    } catch (err) {
      if (err instanceof TemplateExistsError) {
        return res.status(409).json({ error: err.message, code: err.code });
      }
      throw err;
    }
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
