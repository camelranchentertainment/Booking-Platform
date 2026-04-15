// GET /api/band/invite-info?token=xxx
// Returns invite details (band name, email) so the join page can display them.
// No auth required — the token is the credential.

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token is required' });

  const { data: invite } = await supabase
    .from('band_invites')
    .select(`id, email, role, status, expires_at,
      band:bands(band_name, owner_user_id)`)
    .eq('token', token)
    .maybeSingle();

  if (!invite) return res.status(404).json({ error: 'Invite not found or already used.' });
  if (invite.status !== 'pending') return res.status(410).json({ error: 'This invite has already been used.' });
  if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'This invite has expired.' });

  const band = Array.isArray(invite.band) ? invite.band[0] : invite.band;

  // Load agent profile for display
  const { data: agentProfile } = await supabase
    .from('profiles')
    .select('agency_name, agent_name')
    .eq('id', band?.owner_user_id)
    .maybeSingle();

  return res.status(200).json({
    bandName:   band?.band_name || '',
    agencyName: agentProfile?.agency_name || agentProfile?.agent_name || '',
    email:      invite.email,
    role:       invite.role,
  });
}
