import { createClient } from '@supabase/supabase-js';

// Fallbacks prevent createClient from throwing during Next.js build-time
// page data collection when env vars aren't injected. At runtime on Vercel
// the real values are always present.
const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL     ?? 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL     ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY    ?? 'placeholder-service-key',
  );
}
