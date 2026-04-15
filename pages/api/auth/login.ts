// pages/api/auth/login.ts
//
// Signs in an existing user via Supabase auth.
// Sets a session cookie so the dashboard can verify auth server-side.
// Called by the landing page login modal.
// Returns: { userId, email, bandName } on success, { error } on failure.

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Anon client for sign-in (correct — admin not needed for login)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Service role client for fetching band profile after login
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // ── 1. Sign in with Supabase ─────────────────────────────────────────────
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // Supabase error messages are user-friendly: "Invalid login credentials" etc.
      return res.status(401).json({ error: authError.message });
    }

    const userId = authData.user.id;
    const accessToken  = authData.session.access_token;
    const refreshToken = authData.session.refresh_token;

    // ── 2. Fetch band profile ────────────────────────────────────────────────
    const { data: profile } = await supabaseAdmin
      .from('band_profiles')
      .select('band_name, subscription_tier, is_admin')
      .eq('id', userId)
      .maybeSingle();

    // Admins always get premium access regardless of subscription_tier
    const isAdmin = profile?.is_admin === true;
    const effectiveTier = isAdmin ? 'premium' : (profile?.subscription_tier || 'free');

    // ── 3. Set session token as httpOnly cookie ───────────────────────────────
    res.setHeader('Set-Cookie', [
      `sb-access-token=${accessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
    ]);

    return res.status(200).json({
      userId,
      email:            authData.user.email,
      bandName:         profile?.band_name || '',
      subscriptionTier: effectiveTier,
      isAdmin,
      accessToken,
      refreshToken,
    });

  } catch (err: unknown) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}
