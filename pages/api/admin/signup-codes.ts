// pages/api/admin/signup-codes.ts
// Superadmin management of signup codes. proxy.ts already gates /api/admin/*;
// requireSuperadmin re-checks in the route (defense in depth).
//
//   GET  → { codes: [{...code, redemptions: [...] }] }
//   POST → { action: 'create' | 'set_active' | 'set_max_uses' | 'apply_to_account', ... }

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getServiceClient } from '../../../lib/supabase';
import { AppError, withHandler } from '../../../lib/apiError';
import { requireSuperadmin } from '../../../lib/server/requireSuperadmin';
import { redeemSignupCode } from '../../../lib/server/signupCodes';
import { SIGNUP_CODE_PATTERN, normalizeSignupCode } from '../../../lib/domain/signupCode';

const codeField = z.string().transform(v => normalizeSignupCode(v) ?? '').pipe(z.string().regex(SIGNUP_CODE_PATTERN, 'Code must be 4–40 letters, numbers, - or _'));

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    code: codeField,
    label: z.string().trim().min(1).max(120),
    grantDays: z.number().int().min(1).max(1095),
    maxUses: z.number().int().min(1).max(10_000),
  }),
  z.object({ action: z.literal('set_active'), id: z.uuid(), isActive: z.boolean() }),
  z.object({ action: z.literal('set_max_uses'), id: z.uuid(), maxUses: z.number().int().min(1).max(10_000) }),
  z.object({ action: z.literal('apply_to_account'), code: codeField, email: z.string().trim().toLowerCase().max(254) }),
]);

const REDEEM_MESSAGES = {
  code_unknown: 'No such code.',
  code_unavailable: 'That code is inactive, expired or has no uses left.',
  already_redeemed: 'That account has already used a signup code.',
  not_eligible: 'That account is not eligible (not a band admin, or already paying).',
} as const;

async function listCodes(service: ReturnType<typeof getServiceClient>) {
  const { data: codes, error } = await service.from('signup_codes').select('*').order('created_at', { ascending: false });
  if (error) throw new AppError(500, 'Could not load codes', false);

  const { data: redemptions, error: rErr } = await service
    .from('signup_code_redemptions')
    .select('id, code_id, redeemed_at, trial_ends_at, profile:profiles(email, display_name)')
    .order('redeemed_at', { ascending: false });
  if (rErr) throw new AppError(500, 'Could not load redemptions', false);

  return (codes ?? []).map(c => ({
    ...c,
    redemptions: (redemptions ?? []).filter(r => r.code_id === c.id),
  }));
}

export default withHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  const service = getServiceClient();
  await requireSuperadmin(req, service);

  if (req.method === 'GET') {
    res.status(200).json({ codes: await listCodes(service) });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid request');
  const body = parsed.data;

  switch (body.action) {
    case 'create': {
      const { error } = await service.from('signup_codes').insert({
        code: body.code, label: body.label, grant_days: body.grantDays, max_uses: body.maxUses,
      });
      if (error?.code === '23505') throw new AppError(409, 'A code with that name already exists');
      if (error) throw new AppError(500, 'Could not create the code', false);
      break;
    }
    case 'set_active': {
      const { error } = await service.from('signup_codes').update({ is_active: body.isActive }).eq('id', body.id);
      if (error) throw new AppError(500, 'Could not update the code', false);
      break;
    }
    case 'set_max_uses': {
      const { error } = await service.from('signup_codes').update({ max_uses: body.maxUses }).eq('id', body.id);
      // 23514 = check violation: new cap is below the uses already taken.
      if (error?.code === '23514') throw new AppError(409, 'The limit cannot be lower than the uses already taken');
      if (error) throw new AppError(500, 'Could not update the code', false);
      break;
    }
    case 'apply_to_account': {
      // Escape LIKE wildcards so only the exact address matches (profiles.email keeps the case entered).
      const pattern = body.email.replace(/[\\%_]/g, c => `\\${c}`);
      const { data: profile, error } = await service.from('profiles').select('id').ilike('email', pattern).maybeSingle();
      if (error) throw new AppError(500, 'Could not look up the account', false);
      if (!profile) throw new AppError(404, 'No account with that email');
      const outcome = await redeemSignupCode(service, body.code, profile.id);
      if (!outcome.ok) throw new AppError(409, REDEEM_MESSAGES[outcome.reason]);
      break;
    }
  }

  res.status(200).json({ ok: true, codes: await listCodes(service) });
});
