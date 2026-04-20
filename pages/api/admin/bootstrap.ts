import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

const SUPERADMIN_EMAIL = 'scott@camelranchbooking.com';
const SUPERADMIN_PASSWORD = 'Password123';
const SUPERADMIN_NAME = 'Scott';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Require a secret header to prevent abuse — set BOOTSTRAP_SECRET in .env.local
  const secret = req.headers['x-bootstrap-secret'];
  if (!secret || secret !== process.env.BOOTSTRAP_SECRET) {
    return res.status(403).json({ error: 'Forbidden: missing or invalid x-bootstrap-secret header' });
  }

  const supabase = getServiceClient();

  // 1. Create or retrieve the auth user
  let userId: string | undefined;

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email:          SUPERADMIN_EMAIL,
    password:       SUPERADMIN_PASSWORD,
    email_confirm:  true,
  });

  if (createErr) {
    if (!createErr.message.toLowerCase().includes('already registered') &&
        !createErr.message.toLowerCase().includes('already been registered')) {
      return res.status(500).json({ error: `Auth create failed: ${createErr.message}` });
    }
    // User already exists — find them
    const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users?.find(u => u.email === SUPERADMIN_EMAIL);
    if (!existing) return res.status(500).json({ error: 'User exists in auth but could not be found' });
    userId = existing.id;
  } else {
    userId = created.user?.id;
  }

  if (!userId) return res.status(500).json({ error: 'Could not determine user ID' });

  // 2. Upsert the profile with superadmin role
  const { error: profileErr } = await supabase.from('user_profiles').upsert({
    id:           userId,
    role:         'superadmin',
    email:        SUPERADMIN_EMAIL,
    display_name: SUPERADMIN_NAME,
    agency_name:  'Camel Ranch Entertainment',
  }, { onConflict: 'id' });

  if (profileErr) {
    return res.status(500).json({ error: `Profile upsert failed: ${profileErr.message}` });
  }

  return res.status(200).json({
    ok:      true,
    userId,
    email:   SUPERADMIN_EMAIL,
    role:    'superadmin',
    message: 'Superadmin account ready. Please change the password after first login.',
  });
}
