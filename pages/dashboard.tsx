'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [isAuth, setIsAuth] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const auth = localStorage.getItem('isAuthenticated');
    if (auth === 'true') {
      setIsAuth(true);
    } else {
      router.replace('/');
    }
  }, [router]);

  if (!isAuth) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5F5F0'
      }}>
        <div style={{ color: '#5D4E37', fontSize: '1.25rem' }}>Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}
