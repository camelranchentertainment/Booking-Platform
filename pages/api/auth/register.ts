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

  const { email, password, name, bandName, tier, role } = req.body;

  // role: 'agent' (default) or 'band_admin' (band signing up independently)
  const userRole: string = role === 'band_admin' ? 'band_admin' : 'agent';

  // ── Basic validation ──────────────────────────────────────────────────────
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (userRole === 'agent' && !bandName) {
    return res.status(400).json({ error: 'Band name is required for agents.' });
  }
  if (userRole === 'band_admin' && !bandName) {
    return res.status(400).json({ error: 'Band name is required.' });
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

    // ── 2. band_profiles row — agents only ──────────────────────────────────
    // band_admin accounts use profiles + bands tables, not band_profiles
    if (userRole === 'agent') {
      const { error: profileError } = await supabase
        .from('band_profiles')
        .insert({
          id:                userId,
          band_name:         bandName.trim(),
          username:          bandName.trim().toLowerCase().replace(/[^a-z0-9]/g, ''),
          subscription_tier: tier || 'free',
          is_admin:          false,
        });

      if (profileError) {
        await supabase.auth.admin.deleteUser(userId);
        console.error('Profile insert failed:', profileError);
        return res.status(500).json({ error: 'Failed to create band profile. Please try again.' });
      }
    }

    // ── 3. Upsert into profiles table with role ───────────────────────────────
    await supabase
      .from('profiles')
      .upsert({
        id:           userId,
        display_name: name?.trim() || bandName.trim(),
        role:         userRole,
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'id' });

    // ── 4. For band_admin signups, create the band row they own ──────────────
    if (userRole === 'band_admin') {
      const { error: bandError } = await supabase.from('bands').insert({
        owner_user_id: userId,
        band_name:     bandName.trim(),
      });
      if (bandError) {
        await supabase.auth.admin.deleteUser(userId);
        console.error('Band insert failed:', bandError);
        return res.status(500).json({ error: 'Failed to create band. Please try again.' });
      }
    }

    return res.status(200).json({ userId, email, role: userRole });

  } catch (err: unknown) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
}
