import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

export const config = { api: { bodyParser: false } };

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function updateSubscription(
  service: ReturnType<typeof getServiceClient>,
  userId: string,
  sub: Stripe.Subscription
) {
  const statusMap: Record<string, string> = {
    active:             'active',
    trialing:           'trialing',
    past_due:           'past_due',
    canceled:           'cancelled',
    unpaid:             'past_due',
    incomplete:         'inactive',
    incomplete_expired: 'inactive',
    paused:             'inactive',
  };
  await service.from('user_profiles').update({
    stripe_subscription_id: sub.id,
    subscription_status:    statusMap[sub.status] || 'inactive',
  }).eq('id', userId);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'] as string;
  const rawBody = await getRawBody(req);

  const [stripeKey, webhookSecret] = await Promise.all([
    getSetting('stripe_secret_key'),
    getSetting('stripe_webhook_secret'),
  ]);
  if (!stripeKey || !webhookSecret) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    return res.status(400).json({ error: `Webhook signature failed: ${err.message}` });
  }

  const service = getServiceClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      const tier   = session.metadata?.tier;
      if (!userId) break;
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        await service.from('user_profiles').update({
          stripe_customer_id:     session.customer as string,
          stripe_subscription_id: sub.id,
          subscription_status:    'active',
          subscription_tier:      tier || undefined,
          role: tier === 'band_admin' ? 'act_admin' : 'agent',
        }).eq('id', userId);
      }
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (!userId) break;
      await updateSubscription(service, userId, sub);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (!userId) break;
      await service.from('user_profiles').update({
        subscription_status:    'cancelled',
        stripe_subscription_id: null,
      }).eq('id', userId);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await service.from('user_profiles').update({ subscription_status: 'past_due' })
        .eq('stripe_customer_id', invoice.customer as string);
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        await service.from('user_profiles').update({ subscription_status: 'active' })
          .eq('stripe_customer_id', invoice.customer as string);
      }
      break;
    }
  }

  return res.json({ received: true });
}
