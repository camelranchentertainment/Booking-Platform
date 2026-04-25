import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, role, displayName, agencyName, actName } = req.body;

  if (!email || !password || !role || !displayName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!['agent', 'act_admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const admin = getServiceClient();

  // Create auth user server-side — email_confirm skips the confirmation email entirely,
  // avoiding Supabase's email rate limit on the free tier.
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr) return res.status(400).json({ error: authErr.message });

  const userId = authData.user.id;

  // Set a 14-day trial for paid tiers so new users can access the app immediately.
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const profileData: Record<string, unknown> = {
    id: userId,
    role,
    email,
    display_name: displayName,
    subscription_status: 'trialing',
    subscription_tier: role === 'agent' ? 'agent' : 'band_admin',
    trial_ends_at: trialEndsAt,
  };
  if (role === 'agent' && agencyName) profileData.agency_name = agencyName;

  // upsert so the on_auth_user_created trigger row (if present) gets overwritten with correct data
  const { error: profileErr } = await admin.from('user_profiles').upsert(profileData, { onConflict: 'id' });
  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    return res.status(500).json({ error: profileErr.message });
  }

  if (role === 'act_admin' && actName) {
    const { error: actErr } = await admin.from('acts').insert({
      owner_id: userId,
      agent_id: null,
      act_name: actName,
    });
    if (actErr) {
      await admin.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: actErr.message });
    }
  }

  return res.status(200).json({ ok: true });
}
