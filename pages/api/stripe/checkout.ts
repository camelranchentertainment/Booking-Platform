import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const [stripeKey, bandPriceId] = await Promise.all([
    getSetting('stripe_secret_key'),
    getSetting('stripe_band_price_id'),
  ]);
  if (!stripeKey) return res.status(500).json({ error: 'Payments not configured. Add your Stripe keys in Settings.' });

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
  const PRICE_IDS: Record<string, string> = {
    band_admin: bandPriceId || '',
  };

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await service
    .from('user_profiles')
    .select('stripe_customer_id, subscription_tier, role, email')
    .eq('id', user.id)
    .single();

  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const tier = (req.body.tier as string) || profile.subscription_tier || 'band_admin';
  const priceId = PRICE_IDS[tier];
  if (!priceId) return res.status(400).json({ error: `No price configured for tier: ${tier}. Add your Stripe price IDs in Settings.` });

  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email || user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await service.from('user_profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/dashboard?subscribed=1`,
    cancel_url:  `${baseUrl}/pricing?cancelled=1`,
    metadata: { supabase_user_id: user.id, tier },
    subscription_data: { metadata: { supabase_user_id: user.id, tier } },
  });

  return res.json({ url: session.url });
}
