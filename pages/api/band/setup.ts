import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getServiceClient } from '../../../lib/supabase';

const BodySchema = z.object({
  act_name:   z.string().min(1, 'Act name is required').max(200),
  home_city:  z.string().max(100).optional(),
  home_state: z.string().max(100).optional(),
  bio:        z.string().max(2000).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' } });

  const svc = getServiceClient();

  const { data: { user }, error: authErr } = await svc.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session' } });

  const parse = BodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: { code: 'INVALID_BODY', message: parse.error.issues[0]?.message ?? 'Invalid request body' } });
  }
  const { act_name, home_city, home_state, bio } = parse.data;

  // Re-read the profile with service role so we see the ground truth, not a cached browser value.
  const { data: profile } = await svc.from('profiles').select('act_id').eq('id', user.id).single();
  if (profile?.act_id) {
    return res.status(409).json({ error: { code: 'ALREADY_LINKED', message: 'This account is already linked to a band.' } });
  }

  const { data: newAct, error: actErr } = await svc
    .from('acts')
    .insert({
      owner_id:   user.id,
      act_name:   act_name.trim(),
      home_city:  home_city?.trim() || null,
      home_state: home_state?.trim() || null,
      bio:        bio?.trim() || null,
      is_active:  true,
    })
    .select('id')
    .single();

  if (actErr || !newAct) {
    console.error('[band/setup] act insert failed:', actErr?.code);
    return res.status(500).json({ error: { code: 'ACT_CREATE_FAILED', message: 'Failed to create act. Please try again.' } });
  }

  const { error: profileErr } = await svc
    .from('profiles')
    .update({ act_id: newAct.id })
    .eq('id', user.id);

  if (profileErr) {
    // Roll back the orphaned act so the user can retry cleanly.
    await svc.from('acts').delete().eq('id', newAct.id);
    console.error('[band/setup] profile link failed:', profileErr.code);
    return res.status(500).json({ error: { code: 'LINK_FAILED', message: 'Band was created but could not be linked to your account. Please contact support.' } });
  }

  return res.status(200).json({ ok: true, actId: newAct.id });
}
