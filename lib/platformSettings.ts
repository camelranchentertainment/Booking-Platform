import { getServiceClient } from './supabase';

let cache: Record<string, string> | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

export async function getSetting(key: string): Promise<string | null> {
  const now = Date.now();
  if (!cache || now - cacheTime > CACHE_TTL) {
    const service = getServiceClient();
    const { data } = await service.from('platform_settings').select('key, value');
    cache = {};
    for (const row of data || []) cache[row.key] = row.value || '';
    cacheTime = now;
  }
  // Env var takes precedence over DB (allows override without UI)
  const envMap: Record<string, string | undefined> = {
    anthropic_api_key:      process.env.ANTHROPIC_API_KEY,
    firecrawl_api_key:      process.env.FIRECRAWL_API_KEY,
    resend_api_key:         process.env.RESEND_API_KEY,
    resend_from_email:      process.env.RESEND_FROM_EMAIL,
    resend_webhook_secret:  process.env.RESEND_WEBHOOK_SECRET,
    stripe_secret_key:      process.env.STRIPE_SECRET_KEY,
    stripe_webhook_secret:  process.env.STRIPE_WEBHOOK_SECRET,
    stripe_agent_price_id:  process.env.STRIPE_AGENT_PRICE_ID,
    stripe_band_price_id:   process.env.STRIPE_BAND_PRICE_ID,
    google_maps_api_key:    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    google_maps_server_key: process.env.GOOGLE_MAPS_SERVER_KEY,
  };
  return envMap[key] || cache[key] || null;
}

function invalidateCache() {
  cache = null;
}
