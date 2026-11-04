// components/MetaPixelTracker.tsx — reports page views for allowlisted public pages.
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { trackPageView } from '../lib/metaPixel';

/** Renders nothing. Keyed on the route, so changing query strings does not double-count. */
export default function MetaPixelTracker(): null {
  const { pathname, isReady } = useRouter();

  useEffect(() => {
    if (isReady) trackPageView(pathname);
  }, [pathname, isReady]);

  return null;
}
