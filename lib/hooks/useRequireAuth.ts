import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../types';

export function useRequireAuth(requiredRole?: UserRole) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady || loading) {
      return;
    }

    if (!user) {
      router.replace('/login');
      return;
    }

    // The session exists, but the profile may still be loading.
    if (requiredRole && !profile) {
      return;
    }

    if (
      requiredRole &&
      profile?.role !== requiredRole &&
      profile?.role !== 'superadmin'
    ) {
      if (profile?.role === 'band_admin') {
        router.replace('/band');
      } else {
        router.replace('/member');
      }
    }
  }, [
    router.isReady,
    user,
    profile,
    loading,
    requiredRole,
    router,
  ]);

  return { user, profile, loading };
}