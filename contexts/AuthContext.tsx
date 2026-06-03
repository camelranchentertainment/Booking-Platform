import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useRouter } from 'next/router';
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
  try {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    return (data as UserProfile) ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router                = useRouter();
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
        setUser(session?.user ?? null);
        if (session?.user) {
          if (event === 'SIGNED_IN') {
            // Re-enter loading so the UI shows a spinner during profile fetch
            setLoading(true);
            const p = await loadProfile(session.user);
            setLoading(false);
            // Only redirect when coming from login/root — avoids loops on token refresh
            const path = router.pathname;
            if (p?.role && (path === '/login' || path === '/')) {
              if (p.role === 'superadmin') router.push('/admin');
              else if (p.role === 'band_admin') router.push('/band');
              else router.push('/member');
            }
          } else {
            await loadProfile(session.user);
            resolve();
          }
        } else {
          setProfile(null);
          resolve();
        }
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
