// pages/api/gmail/agent-access.ts
//
// The Settings switch for the booking agent's Gmail search. Band admins only;
// the band always comes from the caller's profile.
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { AppError } from '../../../lib/apiError';
import { getServiceClient } from '../../../lib/supabase';
import { requireBandAdmin } from '../../../lib/server/requireBandAdmin';

const bodySchema = z.object({ enabled: z.boolean() }).strict();

/**
 * GET returns { enabled }. PUT with { enabled } saves it and returns { enabled }.
 * Switching on needs a connected Gmail.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or PUT.' } });
  }

  const service = getServiceClient();
  let actId: string;
  let userId: string;
  try {
    ({ actId, userId } = await requireBandAdmin(req, service));
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 401;
    return res.status(status).json({ error: { code: status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED', message: err instanceof Error ? err.message : 'Unauthorized' } });
  }

  const { data: act, error: readErr } = await service.from('acts').select('gmail_address, agent_gmail_access').eq('id', actId).maybeSingle();
  if (readErr || !act) {
    console.error('[gmail/agent-access] read failed', { actId, message: readErr?.message });
    return res.status(500).json({ error: { code: 'READ_FAILED', message: 'Could not load this setting.' } });
  }
  const current = act as { gmail_address: string | null; agent_gmail_access: boolean };
  if (req.method === 'GET') return res.status(200).json({ enabled: current.agent_gmail_access === true });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'enabled must be true or false.' } });
  const { enabled } = parsed.data;
  if (enabled && !current.gmail_address) {
    return res.status(409).json({ error: { code: 'GMAIL_NOT_CONNECTED', message: 'Connect Gmail first.' } });
  }

  const { error: writeErr } = await service.from('acts').update({ agent_gmail_access: enabled }).eq('id', actId);
  if (writeErr) {
    console.error('[gmail/agent-access] save failed', { actId, message: writeErr.message });
    return res.status(500).json({ error: { code: 'SAVE_FAILED', message: 'Could not save this setting.' } });
  }
  console.info('[gmail/agent-access] changed', { actId, userId, enabled });
  return res.status(200).json({ enabled });
}
