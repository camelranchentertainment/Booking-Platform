‘use client’;

import { useEffect, useState } from ‘react’;
import { useRouter } from ‘next/navigation’;

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
const [isAuthenticated, setIsAuthenticated] = useState(false);
const [isLoading, setIsLoading] = useState(true);
const [hasChecked, setHasChecked] = useState(false);
const router = useRouter();

useEffect(() => {
// Only check once
if (hasChecked) return;

```
const checkAuth = () => {
  try {
    const auth = localStorage.getItem('authenticated');
    
    if (auth === 'true') {
      setIsAuthenticated(true);
      setIsLoading(false);
      setHasChecked(true);
    } else {
      setIsAuthenticated(false);
      setIsLoading(false);
      setHasChecked(true);
      // Delay redirect to prevent loops
      setTimeout(() => {
        router.push('/');
      }, 100);
    }
  } catch (error) {
    console.error('Auth check error:', error);
    setIsAuthenticated(false);
    setIsLoading(false);
    setHasChecked(true);
  }
};

checkAuth();
```

}, [hasChecked, router]);

if (isLoading) {
return (
<div style={{
minHeight: ‘100vh’,
display: ‘flex’,
alignItems: ‘center’,
justifyContent: ‘center’,
background: ‘#F5F5F0’
}}>
<div style={{
textAlign: ‘center’,
color: ‘#5D4E37’
}}>
<div style={{ fontSize: ‘2rem’, marginBottom: ‘1rem’ }}>🎸</div>
<div style={{ fontSize: ‘1.25rem’ }}>Loading…</div>
</div>
</div>
);
}

if (!isAuthenticated) {
return (
<div style={{
minHeight: ‘100vh’,
display: ‘flex’,
alignItems: ‘center’,
justifyContent: ‘center’,
background: ‘#F5F5F0’
}}>
<div style={{
textAlign: ‘center’,
color: ‘#5D4E37’
}}>
<div style={{ fontSize: ‘2rem’, marginBottom: ‘1rem’ }}>🔒</div>
<div style={{ fontSize: ‘1.25rem’ }}>Redirecting to login…</div>
</div>
</div>
);
}

return <>{children}</>;
}