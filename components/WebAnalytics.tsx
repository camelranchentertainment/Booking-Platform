// components/WebAnalytics.tsx — loads Vercel Web Analytics once per browser session.
import { useEffect } from 'react';
import { loadWebAnalytics } from '../lib/webAnalytics';

/**
 * Renders nothing. Page views (and which page is allowed to be reported) are
 * handled by Vercel's script and `redactEvent` in lib/webAnalytics.ts.
 */
export default function WebAnalytics(): null {
  useEffect(() => {
    loadWebAnalytics();
  }, []);

  return null;
}
