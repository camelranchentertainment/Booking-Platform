import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const fetchPromise = supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  const timeoutPromise = new Promise<{ data: null }>((resolve) =>
    setTimeout(() => resolve({ data: null }), 5000)
  );

  const { data } = await Promise.race([fetchPromise, timeoutPromise]) as any;
  return (data as UserProfile) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const resolvedRef           = useRef(false);

  const resolve = () => {
    if (!resolvedRef.current) {
      resolvedRef.current = true;
      setLoading(false);
    }
  };

  const loadProfile = async (u: User): Promise<UserProfile | null> => {
    try {
      const p = await fetchProfile(u.id);
      setProfile(p);
      return p;
    } catch {
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user);
  };

  useEffect(() => {
    // Hard 3-second timeout — never leave the app in a loading state
    const timeout = setTimeout(resolve, 3000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          loadProfile(session.user).finally(resolve);
        } else {
          resolve();
        }
      })
      .catch(resolve);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Never wipe state on TOKEN_REFRESHED — it fires mid-navigation with a
        // momentarily null session, clearing profile and causing the sidebar to vanish.
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          resolve();
          return;
        }
        // Only SIGNED_OUT should ever clear the user (handled above with early return).
        // Other events (TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION, PASSWORD_RECOVERY)
        // should update state when a session is present, but must never wipe a logged-in
        // user just because this particular event happened to fire with session === null —
        // confirmed via Supabase auth logs that no real sign-out/token-revocation occurred
        // when this was observed, meaning the session was still valid and this was a
        // false-negative read of session state, not an actual logout.
        if (session?.user) {
          setUser(session.user);
          await loadProfile(session.user);
        }
        resolve();
      },
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut: handleSignOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
