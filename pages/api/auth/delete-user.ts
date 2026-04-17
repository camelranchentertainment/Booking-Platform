// pages/api/auth/delete-user.ts
//
// ONE-TIME UTILITY — deletes a user from Supabase Auth + all related data.
// Protected by ADMIN_SEED_SECRET so only you can run it.
//
// Usage:
//   POST /api/auth/delete-user
//   Body: { "secret": "<ADMIN_SEED_SECRET>", "email": "scott@camelranchbooking.com" }
//
// ⚠️  DELETE THIS FILE after use.

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { secret, email } = req.body;

  if (!process.env.ADMIN_SEED_SECRET || secret !== process.env.ADMIN_SEED_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!email) return res.status(400).json({ error: 'email is required' });

  // Find user by email
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) return res.status(500).json({ error: listError.message });

  const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(404).json({ error: `No user found with email: ${email}` });

  const userId = user.id;

  // Delete related data first (profiles/band_profiles cascade, but bands does not)
  await supabase.from('band_profiles').delete().eq('id', userId);
  await supabase.from('profiles').delete().eq('id', userId);
  await supabase.from('bands').delete().eq('owner_user_id', userId);

  // Delete from Supabase Auth
  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteError) return res.status(500).json({ error: deleteError.message });

  return res.status(200).json({
    ok: true,
    message: `✅ User ${email} (${userId}) deleted. You can now re-register with this email.`,
  });
}
