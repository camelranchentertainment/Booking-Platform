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
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as UserProfile | null;
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
    const loadedProfile = await fetchProfile(u.id);

    if (loadedProfile) {
      setProfile(loadedProfile);
    } else {
      console.error('No profile found for user:', u.id);
    }

    return loadedProfile;
  } catch (error) {
    console.error('Failed to load profile:', error);

    // Keep the existing profile instead of clearing it during a temporary failure.
    return null;
  }
};

  const refreshProfile = async () => {
    if (user) await loadProfile(user);
  };

useEffect(() => {
  supabase.auth.getSession()
    .then(({ data: { session } }) => {
      setUser(session?.user ?? null);

      if (session?.user) {
        loadProfile(session.user).finally(resolve);
      } else {
        resolve();
      }
    })
    .catch((error) => {
      console.error('Failed to get session:', error);
      resolve();
    });

 const {
  data: { subscription },
} = supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    setUser(null);
    setProfile(null);
    resolve();
    return;
  }

  if (session?.user) {
    const sessionUser = session.user;

    setUser(sessionUser);

    if (
      event === 'SIGNED_IN' ||
      event === 'USER_UPDATED' ||
      event === 'PASSWORD_RECOVERY'
    ) {
      setTimeout(() => {
        void loadProfile(sessionUser);
      }, 0);
    }
  }

  resolve();
});

return () => {
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
