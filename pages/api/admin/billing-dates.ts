import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

async function getAuthedSuperadmin(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await service.from('user_profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'superadmin' ? user : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const admin = await getAuthedSuperadmin(req);
  if (!admin) return res.status(403).json({ error: 'Superadmin only' });

  const stripeKey = await getSetting('stripe_secret_key');
  if (!stripeKey) return res.json({});

  const service = getServiceClient();
  const { data: profiles } = await service
    .from('user_profiles')
    .select('id, stripe_subscription_id')
    .not('stripe_subscription_id', 'is', null);

  if (!profiles || profiles.length === 0) return res.json({});

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

  const result: Record<string, string | null> = {};

  await Promise.all(
    profiles.map(async (p: { id: string; stripe_subscription_id: string }) => {
      try {
        const sub = await stripe.subscriptions.retrieve(p.stripe_subscription_id, {
          expand: [],
        });
        const end = (sub as any).current_period_end;
        result[p.id] = end ? new Date(end * 1000).toISOString() : null;
      } catch {
        result[p.id] = null;
      }
    })
  );

  return res.json(result);
}
