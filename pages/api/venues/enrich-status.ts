import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { enrichmentState } from '../../../lib/enrichmentState';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Live count of venues currently missing email (reflects enrichment progress)
  const { count: currentMissing } = await supabase
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .is('email', null);

  const { count: totalVenues } = await supabase
    .from('venues')
    .select('id', { count: 'exact', head: true });

  const missing = currentMissing ?? 0;
  const total = totalVenues ?? 0;
  const enriched = total - missing;

  return res.status(200).json({
    totalVenues: total,
    missingEmail: missing,
    enriched,
    job: { ...enrichmentState },
  });
}
