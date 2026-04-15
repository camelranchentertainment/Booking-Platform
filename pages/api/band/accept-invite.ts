// POST /api/band/accept-invite
// Validates the invite token, creates the Supabase auth user, links them to the band.

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
  if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    // 1. Validate invite
    const { data: invite } = await supabase
      .from('band_invites')
      .select(`id, email, role, status, expires_at, band_id, invited_by,
        band:bands(band_name)`)
      .eq('token', token)
      .maybeSingle();

    if (!invite)                                   return res.status(404).json({ error: 'Invite not found.' });
    if (invite.status !== 'pending')               return res.status(410).json({ error: 'This invite has already been used.' });
    if (new Date(invite.expires_at) < new Date())  return res.status(410).json({ error: 'This invite has expired.' });

    const bandName = (Array.isArray(invite.band) ? invite.band[0] : invite.band)?.band_name || '';

    // 2. Create user (or update password if account already exists)
    let userId: string;
    let accessToken: string;
    let refreshToken: string;

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email:         invite.email,
      password,
      email_confirm: true,
    });

    if (authErr) {
      // Already registered — sign in directly (they may be re-accepting)
      const alreadyExists = authErr.message.toLowerCase().includes('already') ||
                            authErr.message.toLowerCase().includes('exists');
      if (!alreadyExists) throw new Error(authErr.message);

      const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
        email: invite.email, password,
      });
      if (signInErr || !signIn.session) throw new Error('Account already exists. Please log in with your existing password.');
      userId       = signIn.user.id;
      accessToken  = signIn.session.access_token;
      refreshToken = signIn.session.refresh_token;
    } else {
      if (!authData.user) throw new Error('Failed to create account.');
      userId = authData.user.id;

      const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
        email: invite.email, password,
      });
      if (signInErr || !signIn.session) throw new Error('Account created but sign-in failed. Please log in manually.');
      accessToken  = signIn.session.access_token;
      refreshToken = signIn.session.refresh_token;
    }

    // 3. Create/update profile with band_member role
    await supabase.from('profiles').upsert({
      id:           userId,
      display_name: invite.email.split('@')[0],
      role:         'band_member',
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'id' });

    // 4. Link to band via band_members (ignore duplicate)
    const { error: memberErr } = await supabase.from('band_members').upsert({
      band_id: invite.band_id,
      user_id: userId,
      role:    invite.role,
    }, { onConflict: 'band_id,user_id' });

    if (memberErr) throw new Error(memberErr.message);

    // 5. Mark invite as accepted
    await supabase.from('band_invites').update({ status: 'accepted' }).eq('id', invite.id);

    return res.status(200).json({
      ok:           true,
      userId,
      email:        invite.email,
      accessToken,
      refreshToken,
      bandName,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[accept-invite]', msg);
    return res.status(500).json({ error: msg });
  }
}
