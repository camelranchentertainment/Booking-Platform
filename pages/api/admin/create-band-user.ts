import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

// One-shot endpoint to create scott82070@hotmail.com as Band Admin.
// Delete this file after use.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = req.headers['x-bootstrap-secret'];
  if (!secret || secret !== process.env.BOOTSTRAP_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const admin = getServiceClient();
  const email    = 'scott82070@hotmail.com';
  const password = 'Pasword123!';

  // Create or find auth user
  let userId: string;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });

  if (createErr) {
    if (!createErr.message.toLowerCase().includes('already')) {
      return res.status(500).json({ error: createErr.message });
    }
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users.find(u => u.email === email);
    if (!existing) return res.status(500).json({ error: 'User exists but could not be found' });
    userId = existing.id;
  } else {
    userId = created.user.id;
  }

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { error: profileErr } = await admin.from('user_profiles').upsert({
    id: userId,
    role: 'act_admin',
    email,
    display_name: 'Scott',
    subscription_status: 'trialing',
    subscription_tier: 'band_admin',
    trial_ends_at: trialEndsAt,
  }, { onConflict: 'id' });

  if (profileErr) return res.status(500).json({ error: profileErr.message });

  return res.status(200).json({ ok: true, userId, email, role: 'act_admin' });
}
