// pages/api/auth/register.ts
//
// Creates a new Supabase auth user + band_profiles row.
// Called by the landing page signup modal.
// Returns: { userId, email } on success, { error } on failure.

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Service role client — required to create users server-side
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, name, bandName, tier } = req.body;

  // ── Basic validation ──────────────────────────────────────────────────────
  if (!email || !password || !bandName) {
    return res.status(400).json({ error: 'Email, password, and band name are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    // ── 1. Create Supabase auth user ─────────────────────────────────────────
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email verification for now — enable later if desired
    });

    if (authError) {
      // Supabase returns "User already registered" as a clear message
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user.id;

    // ── 2. Create band_profiles row ──────────────────────────────────────────
    const { error: profileError } = await supabase
      .from('band_profiles')
      .insert({
        id:                userId,
        band_name:         bandName.trim(),
        username:          bandName.trim().toLowerCase().replace(/[^a-z0-9]/g, ''),
        subscription_tier: tier || 'free',
        is_admin:          false,
      });

    // If profile insert fails, clean up the auth user so we don't leave orphans
    if (profileError) {
      await supabase.auth.admin.deleteUser(userId);
      console.error('Profile insert failed:', profileError);
      return res.status(500).json({ error: 'Failed to create band profile. Please try again.' });
    }

    // ── 3. Also upsert into profiles table (used by email/settings components) ─
    await supabase
      .from('profiles')
      .upsert({
        id:           userId,
        display_name: name?.trim() || bandName.trim(),
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'id' });

    return res.status(200).json({ userId, email });

  } catch (err: any) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
}
