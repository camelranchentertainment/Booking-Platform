import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  // Require authenticated user
  const token = (req.headers.authorization?.replace('Bearer ', '')) || (req.query.token as string);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const actId = req.query.actId as string;
  if (!actId || !UUID_RE.test(actId)) {
    return res.status(400).json({ error: 'Invalid actId' });
  }

  // Verify the requesting user is a band_admin of this act
  const { data: profile } = await service
    .from('profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (
    !profile ||
    profile.act_id !== actId ||
    !['band_admin', 'superadmin'].includes(profile.role)
  ) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Encode userId:actId in state so the callback can re-verify ownership
  const state = `${user.id}:${actId}`;

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.camelranchbooking.com'}/api/auth/google/gmail-callback`,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/gmail.send',
    access_type:   'offline',
    prompt:        'consent',
    state,
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
