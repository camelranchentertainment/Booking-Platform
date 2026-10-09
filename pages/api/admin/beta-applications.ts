// pages/api/admin/beta-applications.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getServiceClient } from '../../../lib/supabase';
import { withHandler, AppError } from '../../../lib/apiError';
import { BETA_CAP, spotsRemaining } from '../../../lib/domain/betaProgram';
import { requireSuperadmin } from '../../../lib/server/requireSuperadmin';
import { countApprovedBetaApplications, grantBetaYear } from '../../../lib/server/betaProgram';

const reviewSchema = z.object({
  applicationId: z.uuid(),
  action: z.enum(['approve', 'decline', 'grant']),
});

/**
 * Superadmin-only management of founding beta applications.
 *
 * GET  → { applications, approved, spotsRemaining, cap }
 * POST { applicationId, action }
 *   approve — approves (cap enforced in the database) and applies the free
 *             year if the band already has an account
 *   decline — declines a pending application
 *   grant   — retries applying the free year to an approved application
 *             (e.g. after the band signs up under a different email flow)
 */
async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const service = getServiceClient();
  const reviewerId = await requireSuperadmin(req, service);

  if (req.method === 'GET') {
    const { data, error } = await service
      .from('beta_applications')
      .select('id, applicant_name, email, act_name, genre, home_base, shows_per_year, booking_method, website_url, agent_name, status, reviewed_at, granted_at, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new AppError(500, 'Could not load applications', false);

    const approved = await countApprovedBetaApplications(service);
    res.status(200).json({ applications: data ?? [], approved, spotsRemaining: spotsRemaining(approved), cap: BETA_CAP });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'applicationId and a valid action are required');
  const { applicationId, action } = parsed.data;

  if (action === 'decline') {
    const { data, error } = await service
      .from('beta_applications')
      .update({ status: 'declined', reviewed_at: new Date().toISOString(), reviewed_by: reviewerId })
      .eq('id', applicationId)
      .eq('status', 'pending')
      .select('id');
    if (error) throw new AppError(500, 'Could not decline the application', false);
    if (!data?.length) throw new AppError(409, 'Only pending applications can be declined');
    res.status(200).json({ ok: true, status: 'declined' });
    return;
  }

  if (action === 'approve') {
    const { error } = await service.rpc('approve_beta_application', {
      p_application_id: applicationId,
      p_reviewer: reviewerId,
      p_cap: BETA_CAP,
    });
    if (error) {
      if (error.message?.includes('beta_full')) throw new AppError(409, `All ${BETA_CAP} beta spots are already filled`);
      if (error.message?.includes('not_pending')) throw new AppError(409, 'Only pending applications can be approved');
      throw new AppError(500, 'Could not approve the application', false);
    }
  }

  // approve (after the status change) and grant both try to apply the free year now.
  const grant = await grantBetaYear(service, applicationId);
  res.status(200).json({ ok: true, status: 'approved', grant });
}

export default withHandler(handler);
