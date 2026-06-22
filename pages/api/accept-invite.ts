import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../lib/supabase';
import { createNotification } from '../../lib/notifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, displayName } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });

  const bearerToken = req.headers.authorization?.replace('Bearer ', '');
  if (!bearerToken) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getServiceClient();

  const { data: { user } } = await supabase.auth.getUser(bearerToken);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const userId = user.id;

  // Superadmin guard — superadmins must never have their role or act_id changed.
  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (currentProfile?.role === 'superadmin') {
    return res.status(403).json({ error: 'Superadmins cannot accept band invitations' });
  }

  const { data: invite } = await supabase
    .from('act_invitations')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .maybeSingle();

  if (!invite) return res.status(404).json({ error: 'Invalid or expired invite' });
  if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' });

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  // Band members (band_admin, member) get linked via profile.act_id.
  if (existingProfile) {
    // Profile already exists — only update act_id, never touch role.
    const { error: profileErr } = await supabase.from('profiles')
      .update({ act_id: invite.act_id })
      .eq('id', userId);
    if (profileErr) return res.status(500).json({ error: profileErr.message });
  } else {
    // New user — create profile with correct role.
    const { error: profileErr } = await supabase.from('profiles').insert({
      id:           userId,
      role:         invite.role,
      email:        invite.email,
      display_name: displayName || invite.email,
      act_id:       invite.act_id,
    });
    if (profileErr) return res.status(500).json({ error: profileErr.message });
  }

  // When a band admin accepts, claim ownership of the act so the band portal works
  if (invite.role === 'band_admin') {
    await supabase.from('acts').update({ owner_id: userId }).eq('id', invite.act_id);
  }

  // Mark invite accepted
  await supabase.from('act_invitations').update({ status: 'accepted' }).eq('id', invite.id);

  // Notify the band admin who sent the invite
  if (invite.invited_by) {
    const { data: newMember } = await supabase
      .from('profiles')
      .select('display_name, email')
      .eq('id', userId)
      .maybeSingle();
    const name = newMember?.display_name || newMember?.email || 'Someone';
    await createNotification({
      userId:    invite.invited_by,
      actId:     invite.act_id,
      type:      'invite_accepted',
      message:   `${name} accepted your invitation and joined the act.`,
      actionUrl: '/settings',
    });
  }

  return res.status(200).json({ ok: true, role: invite.role });
}
