import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.slice(7);
  const admin = getServiceClient();

  // Verify the JWT belongs to a real Supabase auth user
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { role, email, displayName, agencyName, actName } = req.body;

  if (!role || !email || !displayName) return res.status(400).json({ error: 'Missing required fields' });
  if (!['agent', 'act_admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const profileData: Record<string, unknown> = {
    id: user.id,
    role,
    email,
    display_name: displayName,
  };
  if (role === 'agent' && agencyName) profileData.agency_name = agencyName;

  const { error: profileErr } = await admin.from('user_profiles').insert(profileData);
  if (profileErr) return res.status(500).json({ error: profileErr.message });

  if (role === 'act_admin' && actName) {
    const { error: actErr } = await admin.from('acts').insert({
      owner_id: user.id,
      agent_id: null,
      act_name: actName,
    });
    if (actErr) return res.status(500).json({ error: actErr.message });
  }

  return res.status(200).json({ ok: true });
}
