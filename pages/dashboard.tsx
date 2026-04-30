import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    const redirect = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      const { data: profile } = await supabase
        .from('user_profiles').select('role').eq('id', user.id).maybeSingle();

      const role = profile?.role;
      if (role === 'superadmin') router.replace('/admin');
      else if (role === 'act_admin') router.replace('/band');
      else router.replace('/member');
    };
    redirect();
  }, []);

  return null;
}
