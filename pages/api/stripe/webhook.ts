// pages/api/stripe/webhook.ts
//
// Receives Stripe events and keeps Supabase subscription data in sync.
// No 'micro' package needed — uses Next.js built-in raw body reading.
//
// STRIPE DASHBOARD SETUP:
//   1. Stripe Dashboard → Developers → Webhooks → Add endpoint
//   2. URL: https://camelranchbooking.com/api/stripe/webhook
//   3. Select these events:
//        checkout.session.completed
//        customer.subscription.updated
//        customer.subscription.deleted
//        invoice.payment_failed
//   4. Copy the Signing Secret → add to Vercel as STRIPE_WEBHOOK_SECRET

import { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Disable Next.js body parsing so Stripe can verify the raw signature
export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Read raw body without any external packages
async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function tierFromPriceId(priceId: string): 'basic' | 'premium' | 'free' {
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC)   return 'basic';
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM) return 'premium';
  return 'free';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const sig     = req.headers['stripe-signature'] as string;
  const rawBody = await getRawBody(req);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature failed:', msg);
    return res.status(400).send(`Webhook Error: ${msg}`);
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;
        const userId         = session.metadata?.userId;
        const customerId     = session.customer as string;
        const subscriptionId = session.subscription as string;
        const subscription   = await stripe.subscriptions.retrieve(subscriptionId);
        const tier           = tierFromPriceId(subscription.items.data[0]?.price.id);
        await supabase.from('profiles').update({
          subscription_tier: tier, stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId, subscription_status: 'active',
        }).eq('id', userId);
        console.log(`✅ Activated: userId=${userId}, tier=${tier}`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub        = event.data.object as Stripe.Subscription;
        const tier       = tierFromPriceId(sub.items.data[0]?.price.id);
        const customerId = sub.customer as string;
        const status     = sub.status;
        await supabase.from('profiles').update({
          subscription_tier: status === 'active' ? tier : 'free',
          subscription_status: status,
        }).eq('stripe_customer_id', customerId);
        console.log(`🔄 Updated: customerId=${customerId}, tier=${tier}, status=${status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub        = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        await supabase.from('profiles').update({
          subscription_tier: 'free', subscription_status: 'cancelled',
          stripe_subscription_id: null,
        }).eq('stripe_customer_id', customerId);
        console.log(`❌ Cancelled: customerId=${customerId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        await supabase.from('profiles').update({
          subscription_status: 'payment_failed',
        }).eq('stripe_customer_id', customerId);
        console.log(`⚠️ Payment failed: customerId=${customerId}`);
        break;
      }

      default:
        console.log(`Unhandled event: ${event.type}`);
    }
  } catch (err: unknown) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Webhook handler error' });
  }

  res.status(200).json({ received: true });
}
