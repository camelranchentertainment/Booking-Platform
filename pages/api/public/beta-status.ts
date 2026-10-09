// pages/api/public/beta-status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { withHandler } from '../../../lib/apiError';
import { BETA_CAP, isBetaOpen, spotsRemaining } from '../../../lib/domain/betaProgram';
import { countApprovedBetaApplications } from '../../../lib/server/betaProgram';

/**
 * GET /api/public/beta-status
 * Public, unauthenticated. Returns only aggregate numbers — never applicant data.
 *
 * @returns 200 { open, spotsRemaining, cap }
 */
async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const approved = await countApprovedBetaApplications(getServiceClient());

  // Short shared cache: the counter only moves when Scott approves someone.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).json({
    open: isBetaOpen(approved),
    spotsRemaining: spotsRemaining(approved),
    cap: BETA_CAP,
  });
}

export default withHandler(handler);
