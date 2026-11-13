// lib/shortLinks.js — short, shareable marketing links (camelranchbooking.com/friends).
// Each one forwards to a public page with utm_* tags, so Vercel Web Analytics
// can show which post or message brought a visitor while people only ever see
// and type the short link. CommonJS because next.config.js requires it.
//
// Temporary (307) redirects on purpose: a destination can be changed later
// without browsers having cached the old one forever.

/**
 * @typedef {object} ShortLink
 * @property {string} path    The short path people type, e.g. "/friends".
 * @property {string} page    The public page it lands on, e.g. "/".
 * @property {string} source  utm_source value.
 * @property {string} medium  utm_medium value.
 * @property {string} campaign utm_campaign value.
 */

/** @type {readonly ShortLink[]} */
const SHORT_LINKS = Object.freeze([
  { path: '/friends', page: '/', source: 'referral', medium: 'word-of-mouth', campaign: 'friends' },
  { path: '/fb', page: '/', source: 'facebook', medium: 'organic', campaign: 'beta' },
  { path: '/ig', page: '/', source: 'instagram', medium: 'organic', campaign: 'beta' },
  { path: '/groups', page: '/', source: 'fb-groups', medium: 'community', campaign: 'beta' },
  { path: '/reddit', page: '/', source: 'reddit', medium: 'community', campaign: 'beta' },
  { path: '/hello', page: '/', source: 'dm', medium: 'outreach', campaign: 'beta' },
  { path: '/agents', page: '/booking-agents', source: 'agent', medium: 'outreach', campaign: 'beta' },
]);

/**
 * Builds the tagged destination for one short link.
 * @param {ShortLink} link
 * @returns {string} The page path with utm_source, utm_medium and utm_campaign.
 */
function destinationFor(link) {
  const query = new URLSearchParams({
    utm_source: link.source,
    utm_medium: link.medium,
    utm_campaign: link.campaign,
  });
  return `${link.page}?${query.toString()}`;
}

/**
 * Next.js redirect entries for every short link.
 * @returns {{source: string, destination: string, permanent: false}[]}
 */
function shortLinkRedirects() {
  return SHORT_LINKS.map((link) => ({
    source: link.path,
    destination: destinationFor(link),
    permanent: false,
  }));
}

module.exports = { SHORT_LINKS, destinationFor, shortLinkRedirects };
