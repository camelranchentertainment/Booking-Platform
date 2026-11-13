// lib/webAnalytics.ts — Vercel Web Analytics for the public marketing pages only.
// Answers "how many people visited, from where, and which post sent them"
// (utm_* tags), which the Meta Pixel cannot: the Pixel only reports to Ads Manager.
//
// Loaded with Vercel's own script instead of the @vercel/analytics package,
// because that package's optional @remix-run/react peer (React 18 only)
// conflicts with this app's React 19 and breaks `npm ci`.
//
// Like the Pixel, it never reports a page inside a signed-in account, and it
// drops every query parameter except utm_* (so a /join?token=… sign-up code
// never leaves the browser).

export const ANALYTICS_SCRIPT_URL = '/_vercel/insights/script.js';

/** Exact paths that may be reported. Allowlisted so a new page is private by default. */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  '/', '/register', '/join', '/pricing', '/booking-agents', '/login', '/privacy', '/help',
]);

/** Event shape Vercel's script passes to `beforeSend`. */
export interface AnalyticsEvent {
  type: 'pageview' | 'event';
  url: string;
}

type VaArgs = readonly unknown[];

/** Vercel's command queue function, as its script expects to find it on `window`. */
export type Va = (...args: VaArgs) => void;

/** Window fields used by Vercel Web Analytics. */
export interface AnalyticsWindow {
  va?: Va;
  vaq?: VaArgs[];
}

/**
 * Tells whether a concrete pathname may be reported.
 * @param pathname URL pathname, for example `/register`
 * @returns true only for an allowlisted public page (a trailing slash is ignored)
 */
export function isPublicPath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PUBLIC_PATHS.has(normalized);
}

/**
 * Filters and redacts an event before Vercel's script sends it.
 * @param event the event the script is about to send
 * @returns the event with only utm_* query parameters and no hash,
 *   or null to drop it (private page, or a URL that cannot be parsed)
 */
export function redactEvent(event: AnalyticsEvent): AnalyticsEvent | null {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }
  if (!isPublicPath(url.pathname)) return null;

  for (const key of [...url.searchParams.keys()]) {
    if (!key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
  }
  url.hash = '';
  return { ...event, url: url.toString() };
}

/**
 * Creates Vercel's command queue and registers `redactEvent` as `beforeSend`.
 * The queue must exist before the script loads so the filter applies to the first page view.
 * @param win the window (or a stand-in in tests) to install `va` on
 * @returns true if this call installed it, false if it was already installed
 */
export function installAnalyticsQueue(win: AnalyticsWindow): boolean {
  if (win.va) return false;
  win.va = (...args: VaArgs) => {
    (win.vaq = win.vaq ?? []).push(args);
  };
  win.va('beforeSend', redactEvent);
  return true;
}

/**
 * Installs the queue and loads Vercel's script once. The script then records
 * page views itself, including client-side route changes.
 */
export function loadWebAnalytics(): void {
  if (typeof window === 'undefined') return;
  if (!installAnalyticsQueue(window as unknown as AnalyticsWindow)) return;
  const script = document.createElement('script');
  script.defer = true;
  script.src = ANALYTICS_SCRIPT_URL;
  document.head.appendChild(script);
}
