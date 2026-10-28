import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';
import { resolveYear } from '../../../lib/analyticsYear';
import { AppError, withHandler } from '../../../lib/apiError';
import { requireBandAdmin } from '../../../lib/server/requireBandAdmin';
import { computeAnalytics } from '../../../lib/server/analytics';
import {
  RECOMMENDATION_SYSTEM_PROMPT, parseRecommendations, summarizeForModel,
} from '../../../lib/server/analyticsRecommendations';

/**
 * POST /api/analytics/recommendations  { year?: number }
 *
 * Three or four booking recommendations from the band's own numbers. The
 * figures are computed here for the caller's band (never taken from the
 * request), and only numbers go to the model — no contacts or email text.
 * Band admins / superadmin only (the figures include money).
 *
 * @returns { recommendations: Array<{ title, insight, action }> }
 * @throws AppError 401/403 auth, 405 method, 503 when AI isn't configured
 */
export default withHandler(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') throw new AppError(405, 'Method not allowed');
  const service = getServiceClient();
  const caller = await requireBandAdmin(req, service);

  const body = (req.body ?? {}) as { year?: unknown };
  const year = resolveYear(body.year == null ? undefined : String(body.year), new Date().getFullYear());

  const apiKey = await getSetting('anthropic_api_key');
  if (!apiKey) throw new AppError(503, 'AI recommendations are not set up yet.');

  const [report, actRes] = await Promise.all([
    computeAnalytics(service, caller.actId, year),
    service.from('acts').select('act_name').eq('id', caller.actId).maybeSingle(),
  ]);

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: RECOMMENDATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: summarizeForModel(report, actRes.data?.act_name ?? '') }],
  });
  const text = response.content.map(block => (block.type === 'text' ? block.text : '')).join('');
  const recommendations = parseRecommendations(text);
  if (recommendations.length === 0) {
    console.warn('[analytics/recommendations] model reply had no usable items', { actId: caller.actId, chars: text.length });
  }
  res.status(200).json({ recommendations });
});
