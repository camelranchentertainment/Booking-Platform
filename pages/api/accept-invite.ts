import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, userId, displayName } = req.body;
  if (!token || !userId) return res.status(400).json({ error: 'token and userId required' });

  const supabase = getServiceClient();

  const { data: invite } = await supabase
    .from('act_invitations')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .maybeSingle();

  if (!invite) return res.status(404).json({ error: 'Invalid or expired invite' });
  if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' });

  // Upsert user profile with act membership
  const { error: profileErr } = await supabase.from('user_profiles').upsert({
    id:           userId,
    role:         invite.role,
    email:        invite.email,
    display_name: displayName || invite.email,
    act_id:       invite.act_id,
  }, { onConflict: 'id' });

  if (profileErr) return res.status(500).json({ error: profileErr.message });

  // Mark invite accepted
  await supabase.from('act_invitations').update({ status: 'accepted' }).eq('id', invite.id);

  return res.status(200).json({ ok: true, role: invite.role });
}
