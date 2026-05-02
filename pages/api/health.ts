import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const path = req.query.check as string | undefined;

  // Liveness — process is up
  if (!path || path !== 'ready') {
    return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  // Readiness — verify Supabase connectivity
  let dbStatus: 'up' | 'down' = 'down';
  try {
    const { error } = await getServiceClient()
      .from('user_profiles')
      .select('id', { head: true, count: 'exact' });
    dbStatus = error ? 'down' : 'up';
  } catch {
    dbStatus = 'down';
  }

  const ok = dbStatus === 'up';
  return res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: { db: dbStatus },
  });
}
