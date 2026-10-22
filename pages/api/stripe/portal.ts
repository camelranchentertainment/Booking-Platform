// pages/api/stripe/portal.ts
//
// POST /api/stripe/portal — opens the Stripe billing portal for the signed-in
// account and returns its URL. Agents come back to /agent/settings, bands to
// /settings.
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';
import { AppError, withHandler } from '../../../lib/apiError';
import { BillingError, getBillingAccount, RETURN_PATHS } from '../../../lib/server/billing';

/**
 * Creates a billing-portal session for the caller.
 *
 * @throws AppError 401/403/404/400 for auth, plan or missing-customer problems
 * @throws Error for unexpected failures (500 via withHandler)
 */
async function portal(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
    return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new AppError(401, 'Unauthorized');

  const service = getServiceClient();
  const { data: { user }, error: authErr } = await service.auth.getUser(token);
  if (authErr || !user) throw new AppError(401, 'Unauthorized');

  let account;
  try {
    account = await getBillingAccount(service, user.id);
  } catch (err) {
    if (err instanceof BillingError) throw new AppError(err.status, err.message);
    throw err;
  }
  if (!account.stripeCustomerId) throw new AppError(400, 'No billing account yet. Subscribe first.');

  const stripeKey = await getSetting('stripe_secret_key');
  if (!stripeKey) throw new AppError(500, 'Payments are not set up yet. Please try again later.');

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const session = await stripe.billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: `${baseUrl}${RETURN_PATHS[account.plan].portal}`,
  });

  res.status(200).json({ url: session.url });
}

export default withHandler(portal);
