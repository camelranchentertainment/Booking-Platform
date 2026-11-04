// lib/metaPixel.ts — Meta Pixel for the public marketing pages only.
// The Pixel must never run inside a signed-in account: those pages hold band,
// venue and money data, and the Privacy Policy promises they stay out of advertising.

export const META_PIXEL_ID = '1818836306112851';
const PIXEL_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';

/** Exact routes the Pixel may track. Allowlisted so a new page is private by default. */
const TRACKED_PATHS: ReadonlySet<string> = new Set(['/', '/register', '/booking-agents']);

type FbqArgs = readonly unknown[];

/** Shape of Meta's `fbq` function, including the fields its script reads while loading. */
export interface Fbq {
  (...args: FbqArgs): void;
  callMethod?: (...args: FbqArgs) => void;
  queue: FbqArgs[];
  loaded: boolean;
  version: string;
  push: (...args: FbqArgs) => void;
  disablePushState: boolean;
}

/** Window fields used by the Pixel. */
export interface PixelWindow {
  fbq?: Fbq;
  _fbq?: Fbq;
}

/**
 * Tells whether a Next.js route pattern may be tracked.
 * @param pathname `router.pathname`, for example `/register`
 * @returns true only for an allowlisted public page
 */
export function isTrackedPath(pathname: string): boolean {
  return TRACKED_PATHS.has(pathname);
}

/**
 * Creates the Pixel's command queue with automatic collection turned off.
 * `disablePushState` stops page views firing on in-app navigation, which would
 * otherwise report private routes after someone signs in. `autoConfig` off stops
 * Meta reading button text and page data on its own.
 * @param win the window (or a stand-in in tests) to install `fbq` on
 * @returns true if this call installed it, false if it was already installed
 */
export function installPixelQueue(win: PixelWindow): boolean {
  if (win.fbq) return false;
  const fbq = ((...args: FbqArgs) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  }) as Fbq;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.push = fbq;
  fbq.disablePushState = true;
  win.fbq = fbq;
  win._fbq = fbq;
  fbq('set', 'autoConfig', false, META_PIXEL_ID);
  fbq('init', META_PIXEL_ID);
  return true;
}

/** Installs the Pixel in the browser and loads Meta's script once. */
function ensurePixelLoaded(): void {
  if (!installPixelQueue(window as unknown as PixelWindow)) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = PIXEL_SCRIPT_URL;
  document.head.appendChild(script);
}

/**
 * Records a page view when the route is allowlisted; otherwise does nothing.
 * @param pathname `router.pathname` of the page being shown
 */
export function trackPageView(pathname: string): void {
  if (typeof window === 'undefined' || !isTrackedPath(pathname)) return;
  ensurePixelLoaded();
  (window as unknown as PixelWindow).fbq?.('track', 'PageView');
}

/**
 * Records a completed band sign-up. Sends no name, email or band details.
 * Does nothing if the Pixel was never loaded, such as when an ad blocker removed it.
 */
export function trackCompleteRegistration(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as PixelWindow).fbq?.('track', 'CompleteRegistration');
}
