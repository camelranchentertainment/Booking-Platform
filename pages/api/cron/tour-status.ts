import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabase.rpc('auto_complete_tours');

  if (error) {
    console.error('[tour-status cron]', error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    ok: true,
    ...(data as { completed: number; cancelled: number }),
    timestamp: new Date().toISOString(),
  });
}
