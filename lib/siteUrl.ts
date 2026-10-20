// lib/siteUrl.ts
//
// The site's canonical public origin. camelranchbooking.com redirects to the
// www host, so search engines and link previews must be pointed at www
// directly — a canonical/sitemap URL that redirects is treated as a
// "Page with redirect" and isn't indexed under that address.
//
// Only for SEO/sharing metadata. Do not use for OAuth redirect URIs, email
// links or iCal feeds; those are configured separately.
export const SITE_ORIGIN = 'https://www.camelranchbooking.com';
