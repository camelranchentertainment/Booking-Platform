// pages/booker/contacts.tsx
// Contacts now live on each venue's profile (decided Oct 10, 2026). This route
// stays only so old links and bookmarks land somewhere useful.

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function BookerContactsMoved() {
  const router = useRouter();
  useEffect(() => {
    void router.replace('/booker/venues');
  }, [router]);
  return (
    <p role="status" style={{ padding: '2rem', color: 'var(--text-muted)' }}>
      Contacts are now on each venue’s page. Taking you to Venues &amp; Buyers…
    </p>
  );
}
