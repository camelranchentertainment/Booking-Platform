// pages/api/stripe/webhook.ts
//
// Listens for Stripe events and keeps the user's subscription tier
// in sync in the Supabase `profiles` table.
//
// REQUIRED: Add a `subscription_tier` column to your profiles table:
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free';
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
//
// STRIPE DASHBOARD SETUP:
//   1. Go to Stripe Dashboard → Developers → Webhooks
//   2. Add endpoint: https://camelranchbooking.com/api/stripe/webhook
//   3. Select events:
//        checkout.session.completed
//        customer.subscription.updated
//        customer.subscription.deleted
//        invoice.payment_failed
//   4. Copy the Signing Secret → add to Vercel as STRIPE_WEBHOOK_SECRET

import { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { buffer } from 'micro';

// Disable Next.js body parsing — Stripe needs the raw body to verify signature
export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Maps Stripe Price ID → tier name
function tierFromPriceId(priceId: string): 'basic' | 'premium' | 'free' {
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC)   return 'basic';
  if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM) return 'premium';
  return 'free';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const sig = req.headers['stripe-signature'] as string;
  const rawBody = await buffer(req);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const userId       = session.metadata?.userId;
        const customerId   = session.customer as string;
        const subscriptionId = session.subscription as string;

        // Fetch the subscription to find out the price
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price.id;
        const tier = tierFromPriceId(priceId);

        await supabase.from('profiles').update({
          subscription_tier:     tier,
          stripe_customer_id:    customerId,
          stripe_subscription_id: subscriptionId,
          subscription_status:   'active',
        }).eq('id', userId);

        console.log(`✅ Subscription activated: userId=${userId}, tier=${tier}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const priceId      = subscription.items.data[0]?.price.id;
        const tier         = tierFromPriceId(priceId);
        const customerId   = subscription.customer as string;
        const status       = subscription.status; // active, past_due, canceled, etc.

        await supabase.from('profiles').update({
          subscription_tier:     status === 'active' ? tier : 'free',
          subscription_status:   status,
        }).eq('stripe_customer_id', customerId);

        console.log(`🔄 Subscription updated: customerId=${customerId}, tier=${tier}, status=${status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId   = subscription.customer as string;

        await supabase.from('profiles').update({
          subscription_tier:     'free',
          subscription_status:   'cancelled',
          stripe_subscription_id: null,
        }).eq('stripe_customer_id', customerId);

        console.log(`❌ Subscription cancelled: customerId=${customerId}`);
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
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: err.message });
  }

  res.status(200).json({ received: true });
}
