import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

async function getAuthedSuperadmin(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await service
    .from('user_profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'superadmin' ? user : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthedSuperadmin(req);
  if (!user) return res.status(403).json({ error: 'Superadmin only' });

  const service = getServiceClient();

  if (req.method === 'GET') {
    const { data } = await service
      .from('platform_settings')
      .select('key, value');

    // Non-secret keys returned as-is; all others returned as configured: bool only
    const PUBLIC_KEYS = new Set(['resend_from_email', 'stripe_agent_price_id', 'stripe_band_price_id', 'google_maps_api_key']);
    const masked = (data || []).map((row: any) => ({
      key: row.key,
      configured: Boolean(row.value && row.value.length > 2),
      value: PUBLIC_KEYS.has(row.key) ? row.value : undefined,
    }));

    return res.json(masked);
  }

  if (req.method === 'POST') {
    const { key, value } = req.body;
    if (!key || value === undefined) return res.status(400).json({ error: 'key and value required' });

    await service.from('platform_settings').upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

    return res.json({ ok: true });
  }

  return res.status(405).end();
}
