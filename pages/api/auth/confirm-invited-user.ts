import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

/**
 * POST /api/auth/confirm-invited-user
 * Body: { token: string }
 *
 * Why this exists:
 * join.tsx calls supabase.auth.signUp() client-side. With "Confirm email"
 * enabled at the Supabase project level, signUp() creates the auth.users
 * row but returns session: null until the user clicks a separate
 * confirmation email — a redundant second verification step, since the
 * invite link itself already proves email ownership (accept-invite.ts
 * separately checks invite.email === user.email before doing anything).
 *
 * This endpoint force-confirms the just-created user's email server-side,
 * authorized by the invite token alone (not a bearer session, since the
 * client has no session yet — that's exactly the problem being solved).
 * It does NOT touch profiles, act_id, or act_personnel — that work stays
 * entirely inside accept-invite.ts, called by the client immediately after
 * this confirms and the client successfully signs in.
 *
 * Security: the invite token is the authorization. We only ever confirm
 * the email address on the invitation row, scoped to a still-pending,
 * unexpired invite — never an arbitrary email supplied by the request body.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.body as { token?: string };
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token required' });
  }

  const supabase = getServiceClient();

  const { data: invite } = await supabase
    .from('act_invitations')
    .select('email, status, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite) return res.status(404).json({ error: 'Invalid invite' });
  if (invite.status !== 'pending') return res.status(410).json({ error: 'This invite has already been used.' });
  if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'This invite has expired.' });

  // Find the just-created auth user by the invite's email — not by any
  // user-supplied id, to avoid trusting client input for identity lookup.
  const { data: usersPage, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('confirm-invited-user listUsers error:', listErr);
    return res.status(500).json({ error: 'Failed to locate account' });
  }

  const matchedUser = usersPage.users.find(
    (u) => u.email?.toLowerCase() === invite.email.toLowerCase()
  );

  if (!matchedUser) {
    return res.status(404).json({ error: 'No account found for this invite yet. Please sign up first.' });
  }

  if (matchedUser.email_confirmed_at) {
    // Already confirmed (e.g., user retried) — nothing to do, not an error.
    return res.status(200).json({ ok: true, alreadyConfirmed: true });
  }

  const { error: confirmErr } = await supabase.auth.admin.updateUserById(matchedUser.id, {
    email_confirm: true,
  });

  if (confirmErr) {
    console.error('confirm-invited-user updateUserById error:', confirmErr);
    return res.status(500).json({ error: 'Failed to confirm account' });
  }

  return res.status(200).json({ ok: true, alreadyConfirmed: false });
}
