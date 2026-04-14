// pages/api/stripe/create-checkout.ts
//
// Creates a Stripe Checkout Session for Basic or Premium subscriptions.
// After successful payment, Stripe redirects to /dashboard?session_id=...
// The webhook (pages/api/stripe/webhook.ts) then updates the user's tier in Supabase.
//
// SETUP CHECKLIST:
//  1. npm install stripe
//  2. In Vercel Environment Variables add:
//       STRIPE_SECRET_KEY        = sk_live_... (or sk_test_... for testing)
//       STRIPE_WEBHOOK_SECRET    = whsec_...   (from Stripe Dashboard → Webhooks)
//       NEXT_PUBLIC_STRIPE_PRICE_BASIC    = price_...  (from Stripe product)
//       NEXT_PUBLIC_STRIPE_PRICE_PREMIUM  = price_...  (from Stripe product)
//       NEXT_PUBLIC_APP_URL      = https://camelranchbooking.com

import { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { priceId, email, userId } = req.body;

  if (!priceId || !email || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://camelranchbooking.com';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/?subscription=cancelled`,
      metadata: {
        userId,          // stored so the webhook can update the correct user
        email,
      },
      subscription_data: {
        metadata: { userId, email },
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: unknown) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Checkout failed' });
  }
}
