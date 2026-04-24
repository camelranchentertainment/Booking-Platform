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

  if (invite.role === 'agent') {
    // Agents link to an act — they don't join as a band member
    const { error: profileErr } = await supabase.from('user_profiles').upsert({
      id:           userId,
      role:         'agent',
      email:        invite.email,
      display_name: displayName || invite.email,
      // do NOT set act_id — agents are linked via agent_act_links, not via profile.act_id
    }, { onConflict: 'id' });

    if (profileErr) return res.status(500).json({ error: profileErr.message });

    // Set acts.agent_id so the band's act page knows their primary agent
    await supabase.from('acts').update({ agent_id: userId }).eq('id', invite.act_id);

    // Create the agent_act_links record (active, full manage permissions)
    await supabase.from('agent_act_links').upsert({
      agent_id:    userId,
      act_id:      invite.act_id,
      status:      'active',
      permissions: 'manage',
    }, { onConflict: 'agent_id,act_id' });
  } else {
    // Band members (act_admin, member) get linked via profile.act_id
    const { error: profileErr } = await supabase.from('user_profiles').upsert({
      id:           userId,
      role:         invite.role,
      email:        invite.email,
      display_name: displayName || invite.email,
      act_id:       invite.act_id,
    }, { onConflict: 'id' });

    if (profileErr) return res.status(500).json({ error: profileErr.message });

    // When a band admin accepts, claim ownership of the act so the band portal works
    if (invite.role === 'act_admin') {
      await supabase.from('acts').update({ owner_id: userId }).eq('id', invite.act_id);
    }
  }

  // Mark invite accepted
  await supabase.from('act_invitations').update({ status: 'accepted' }).eq('id', invite.id);

  return res.status(200).json({ ok: true, role: invite.role });
}
