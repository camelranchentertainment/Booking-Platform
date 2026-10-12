// pages/api/booker/messages/draft.ts
// POST — "Draft with AI" for the Booking Agent workspace. Returns a subject and
// body for the agent to review and edit; nothing is sent or saved here.
//
// Body (DraftRequestSchema): template_key?, instructions?, to_name?, audience,
// roster_id?, venue_id?, contact_id?, show_id?
//
//   200 { draft: { subject, body } }
//   400 invalid body / reference not the caller's
//   401/403 not an agent
//   429 AI limit reached (or provider busy)
//   501 AI not configured, 502 provider error or unusable output
//
// Service role: the caller is resolved with requireBooker and every fact given
// to the model is read with booker_id = caller, so one agent's contacts and
// deals can never reach another agent's draft.

import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '../../../../lib/supabase';
import { AppError, withHandler } from '../../../../lib/apiError';
import { getSetting } from '../../../../lib/platformSettings';
import { requireBooker } from '../../../../lib/server/requireBooker';
import { resolveLinks } from '../../../../lib/server/bookerMessages';
import { claimAiDraft, loadDraftFacts } from '../../../../lib/server/bookerDraft';
import { draftSystemPrompt, draftUserPrompt, parseDraft } from '../../../../lib/server/bookerDraftPrompt';
import { DraftRequestSchema } from '../../../../lib/booker/schemas';
import { todayIso } from '../../../../lib/booker/dates';

export const DRAFT_MODEL = 'claude-sonnet-4-6';

/** Drafts one email for the signed-in agent. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    throw new AppError(405, 'Method not allowed');
  }
  const service = getServiceClient();
  const { bookerId } = await requireBooker(req, service);

  const parsed = DraftRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the request and try again');
  const input = parsed.data;

  const apiKey = await getSetting('anthropic_api_key');
  if (!apiKey) throw new AppError(501, 'AI drafting is not set up yet. Ask the platform admin to add the Anthropic key.');

  const links = await resolveLinks(service, bookerId, input);
  const facts = await loadDraftFacts(service, bookerId, links, input, todayIso());
  await claimAiDraft(service, bookerId);

  const client = new Anthropic({ apiKey });
  let text: string;
  try {
    const message = await client.messages.create({
      model: DRAFT_MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: draftSystemPrompt(facts.audience, facts.relationship), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: draftUserPrompt(facts) }],
    });
    text = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new AppError(429, 'The AI is busy right now. Try again in a moment.');
    console.error('[booker/messages/draft] model call failed', { name: err instanceof Error ? err.name : 'unknown' });
    throw new AppError(502, 'AI drafting is unavailable right now. Try again, or start from a template.');
  }

  const draft = parseDraft(text);
  if (!draft) throw new AppError(502, 'The AI draft came back empty. Try again, or start from a template.');
  res.status(200).json({ draft });
}

export default withHandler(handler);
