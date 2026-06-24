import { supabase } from './supabase';
import { UserProfile } from './types';

export async function getCurrentUser() {
  // getSession() reads from local storage — no network round-trip.
  // getUser() re-validates against the Auth server on every call, which
  // was the source of intermittent forced logouts across the app when
  // this pattern was used directly in page components.
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*, acts(id, act_name, logo_url)')
    .eq('id', user.id)
    .single();

  if (error) return null;
  return data as UserProfile;
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function signUp(email: string, password: string, displayName: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
}
