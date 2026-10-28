import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { resolveYear } from '../../../lib/analyticsYear';
import { AppError, withHandler } from '../../../lib/apiError';
import { requireBandAdmin } from '../../../lib/server/requireBandAdmin';
import { computeAnalytics } from '../../../lib/server/analytics';

/**
 * GET /api/analytics?year=YYYY
 *
 * The band's pipeline, outreach and money figures for one calendar year
 * (default: this year). Band admins / superadmin only: the report includes
 * earnings, and members never see money. The band comes from the caller's
 * profile (requireBandAdmin), never from the request.
 *
 * @throws AppError 401/403 auth, 405 method
 */
export default withHandler(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') throw new AppError(405, 'Method not allowed');
  const service = getServiceClient();
  const caller = await requireBandAdmin(req, service);
  const year = resolveYear(req.query.year, new Date().getFullYear());
  const report = await computeAnalytics(service, caller.actId, year);
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json(report);
});
