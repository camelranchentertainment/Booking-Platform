import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Fallbacks prevent createClient from throwing during Next.js build-time
// page data collection when env vars aren't injected. At runtime on Vercel
// the real values are always present.
const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL      ?? 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key';

// Singleton guard: in Next.js Pages Router the module can be re-evaluated
// (HMR, fast refresh, certain import patterns). Without this guard each
// re-evaluation creates a new SupabaseClient with its own autoRefreshToken
// timer. Two timers racing to refresh the same token trips Supabase's
// token-reuse detection and revokes the session, logging the user out.
const globalForSupabase = global as typeof global & {
  _supabaseClient?: SupabaseClient;
};

export const supabase: SupabaseClient =
  globalForSupabase._supabaseClient ??
  (globalForSupabase._supabaseClient = createClient(supabaseUrl, supabaseAnonKey));

export function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL    ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY   ?? 'placeholder-service-key',
  );
}
