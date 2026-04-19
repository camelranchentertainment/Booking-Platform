import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token required' });

  const supabase = getServiceClient();
  const { data: invite } = await supabase
    .from('act_invitations')
    .select('id, act_id, email, role, status, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite) return res.status(404).json({ error: 'Invite not found.' });
  if (invite.status !== 'pending') return res.status(410).json({ error: 'This invite has already been used.' });
  if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'This invite has expired.' });

  const { data: act } = await supabase.from('acts').select('act_name').eq('id', invite.act_id).maybeSingle();

  return res.status(200).json({
    actName: act?.act_name || '',
    email:   invite.email,
    role:    invite.role,
  });
}
