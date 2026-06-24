import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    const redirect = async () => {
      // getSession() reads the already-validated session from local
      // storage — no network round-trip. getUser() re-validates against
      // the Auth server on every call, so a single slow network response
      // here was bouncing freshly-logged-in users straight back to /login.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.replace('/login'); return; }
      const user = session.user;

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).maybeSingle();

      const role = profile?.role;
      if (role === 'superadmin') router.replace('/admin');
      else if (role === 'band_admin') router.replace('/band');
      else router.replace('/member');
    };
    redirect();
  }, []);

  return null;
}
