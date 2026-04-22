import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

// One-shot endpoint — creates the two test users below.
// Call once, then delete this file.
const USERS = [
  {
    email:       'jake@camelranchbooking.com',
    password:    'Password123!',
    role:        'act_admin',
    displayName: 'Jake',
    tier:        'band_admin',
  },
  {
    email:       'scott82070@hotmail.com',
    password:    'Password123!',
    role:        'member',
    displayName: 'Scott',
    tier:        'member',
  },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = req.headers['x-bootstrap-secret'];
  if (!secret || secret !== process.env.BOOTSTRAP_SECRET) {
    return res.status(403).json({ error: 'Forbidden — send x-bootstrap-secret header' });
  }

  const admin = getServiceClient();
  const results: any[] = [];

  for (const u of USERS) {
    // Create or find the auth user
    let userId: string;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: u.email, password: u.password, email_confirm: true,
    });

    if (createErr) {
      if (!createErr.message.toLowerCase().includes('already')) {
        results.push({ email: u.email, error: createErr.message });
        continue;
      }
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existing = list?.users.find(x => x.email === u.email);
      if (!existing) { results.push({ email: u.email, error: 'exists but not found' }); continue; }
      userId = existing.id;
    } else {
      userId = created.user.id;
    }

    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { error: profileErr } = await admin.from('user_profiles').upsert({
      id:                  userId,
      role:                u.role,
      email:               u.email,
      display_name:        u.displayName,
      subscription_status: u.role === 'member' ? 'active'  : 'trialing',
      subscription_tier:   u.role === 'member' ? 'member'  : u.tier,
      trial_ends_at:       u.role === 'member' ? null      : trialEndsAt,
    }, { onConflict: 'id' });

    results.push({ email: u.email, role: u.role, userId, error: profileErr?.message ?? null });
  }

  return res.status(200).json({ results });
}
