import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../types';

export function useRequireAuth(requiredRole?: UserRole) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (requiredRole && profile?.role !== requiredRole && profile?.role !== 'superadmin') {
      if (profile?.role === 'band_admin') {
        router.replace('/band');
      } else {
        router.replace('/member');
      }
    }
  }, [user, profile, loading, requiredRole, router]);

  return { user, profile, loading };
}
