// pages/api/stripe/checkout.ts
//
// POST /api/stripe/checkout — starts a Stripe Checkout subscription for the
// signed-in account. The plan (Band Admin or Booking Agent) is decided from
// the account on the server (lib/server/billing.ts); the request body is not
// trusted for it.
//
// Responses: 200 { url } | 401 | 403 | 404 | 409 already subscribed |
//            500 { error } payments not configured / unexpected (Sentry)
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';
import { AppError, withHandler } from '../../../lib/apiError';
import { BillingError, getBillingAccount, PRICE_SETTING, RETURN_PATHS } from '../../../lib/server/billing';

const STRIPE_API_VERSION = '2023-10-16' as const;

/**
 * Creates a Checkout Session for the caller's plan and returns its URL.
 *
 * @throws AppError for auth, plan and configuration problems
 * @throws Error for unexpected Stripe or database failures (500 via withHandler)
 */
async function checkout(req: NextApiRequest, res: NextApiResponse): Promise<void> {
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

  // One subscription per account: changes go through the billing portal.
  if (account.stripeSubscriptionId) {
    throw new AppError(409, 'You already have a subscription. Use Manage billing to change it.');
  }

  const [stripeKey, priceId] = await Promise.all([
    getSetting('stripe_secret_key'),
    getSetting(PRICE_SETTING[account.plan]),
  ]);
  if (!stripeKey || !priceId) {
    console.error('[stripe/checkout] payments not configured', { plan: account.plan, hasKey: !!stripeKey, hasPrice: !!priceId });
    throw new AppError(500, 'Payments are not set up yet. Please try again later.');
  }

  const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });

  let customerId = account.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: account.email || user.email || undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    const { error: saveErr } = await service.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    if (saveErr) throw new Error(`saving stripe customer failed: ${saveErr.message}`);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const paths = RETURN_PATHS[account.plan];
  const metadata = { supabase_user_id: user.id, tier: account.plan };

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}${paths.success}`,
    cancel_url: `${baseUrl}${paths.cancel}`,
    metadata,
    subscription_data: { metadata },
  });

  console.info(JSON.stringify({ event: 'stripe_checkout_created', userId: user.id, plan: account.plan }));
  res.status(200).json({ url: session.url });
}

export default withHandler(checkout);
