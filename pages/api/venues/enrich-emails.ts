import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { enrichmentState } from '../../../lib/enrichmentState';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BATCH_SIZE = 10;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// ── Email extraction ────────────────────────────────────────────────────────

function extractEmails(html: string): string[] {
  const found = new Set<string>();

  // mailto: hrefs
  const mailtoRe = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(html)) !== null) {
    found.add(m[1].toLowerCase());
  }

  // Bare email patterns in text/HTML
  const emailRe = /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/g;
  while ((m = emailRe.exec(html)) !== null) {
    const e = m[1].toLowerCase();
    // Skip asset paths and common false-positives
    if (
      !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.gif') &&
      !e.endsWith('.svg') && !e.endsWith('.css') && !e.endsWith('.js') &&
      !e.includes('example.') && !e.includes('schema.org') &&
      !e.includes('sentry') && !e.includes('wixpress') &&
      !e.includes('squarespace') && !e.includes('@2x')
    ) {
      found.add(e);
    }
  }

  return Array.from(found);
}

// Rank so booking/contact emails bubble to the top
function rankEmails(emails: string[]): string[] {
  const priority = ['booking', 'book', 'contact', 'info', 'music', 'live', 'shows', 'gigs', 'entertainment', 'events'];
  return [...emails].sort((a, b) => {
    const ai = priority.findIndex(p => a.includes(p));
    const bi = priority.findIndex(p => b.includes(p));
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

async function fetchPage(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VenueContactBot/1.0; +https://camelranchentertainment.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    // Limit read to 500 KB to avoid giant pages
    const text = await res.text();
    return text.slice(0, 512_000);
  } catch {
    return null;
  }
}

// ── Scraping strategies ─────────────────────────────────────────────────────

async function scrapeWebsiteForEmail(rawUrl: string): Promise<string | null> {
  let base = rawUrl.trim();
  if (!base.startsWith('http')) base = `https://${base}`;
  base = base.replace(/\/$/, '');

  const paths = ['', '/contact', '/contact-us', '/booking', '/bookings', '/about', '/hire-us', '/hire'];

  for (const path of paths) {
    const html = await fetchPage(`${base}${path}`);
    if (!html) continue;
    const ranked = rankEmails(extractEmails(html));
    if (ranked.length > 0) return ranked[0];
    await pause(250);
  }
  return null;
}

async function getWebsiteFromGooglePlaces(name: string, city: string, state: string): Promise<{ website: string | null; placeId: string | null }> {
  if (!GOOGLE_API_KEY) return { website: null, placeId: null };
  try {
    const q = encodeURIComponent(`${name} ${city} ${state}`);
    const searchRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${GOOGLE_API_KEY}`
    );
    const searchData = await searchRes.json();
    if (!searchData.results?.length) return { website: null, placeId: null };

    const placeId: string = searchData.results[0].place_id;
    const detRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website&key=${GOOGLE_API_KEY}`
    );
    const detData = await detRes.json();
    return { website: detData.result?.website || null, placeId };
  } catch {
    return { website: null, placeId: null };
  }
}

async function getFacebookEmail(venueName: string): Promise<string | null> {
  // Best-effort: try common Facebook URL slugs from venue name
  const slug = venueName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const candidates = [
    `https://www.facebook.com/${slug}/about`,
    `https://www.facebook.com/pg/${slug}/about`,
  ];
  for (const url of candidates) {
    const html = await fetchPage(url, 5000);
    if (!html) continue;
    const emails = rankEmails(extractEmails(html));
    if (emails.length > 0) return emails[0];
    await pause(300);
  }
  return null;
}

// ── Job runner ──────────────────────────────────────────────────────────────

function pause(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function runEnrichmentJob(): Promise<void> {
  Object.assign(enrichmentState, {
    running: true,
    processed: 0,
    found: 0,
    currentVenue: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  });

  try {
    // Snapshot of venue IDs missing email at job start
    const { data: rows, error: listErr } = await supabase
      .from('venues')
      .select('id')
      .is('email', null)
      .order('name');

    if (listErr) throw listErr;

    const ids = (rows || []).map(r => r.id as string);
    enrichmentState.totalMissing = ids.length;

    // Process in batches
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE);

      const { data: venues } = await supabase
        .from('venues')
        .select('id, name, city, state, website')
        .in('id', batchIds);

      for (const venue of (venues || [])) {
        enrichmentState.currentVenue = venue.name;

        let foundEmail: string | null = null;
        let foundWebsite: string | null = null;

        // 1. Ensure we have a website
        let website: string | null = venue.website || null;

        if (!website) {
          const placed = await getWebsiteFromGooglePlaces(venue.name, venue.city, venue.state);
          website = placed.website;
          foundWebsite = placed.website;
          await pause(350);
        }

        // 2. Scrape website
        if (website) {
          foundEmail = await scrapeWebsiteForEmail(website);
          await pause(350);
        }

        // 3. Try Facebook as fallback
        if (!foundEmail) {
          foundEmail = await getFacebookEmail(venue.name);
          await pause(350);
        }

        // 4. Persist — non-destructive: only update if email is still null
        if (foundEmail || foundWebsite) {
          const patch: Record<string, string> = {};
          if (foundEmail) patch.email = foundEmail;
          if (foundWebsite && !venue.website) patch.website = foundWebsite;

          await supabase
            .from('venues')
            .update(patch)
            .eq('id', venue.id)
            .is('email', null); // guard: never overwrite an email set since job started

          if (foundEmail) enrichmentState.found++;
        }

        enrichmentState.processed++;
        await pause(300);
      }

      // Rate-limit between batches
      if (i + BATCH_SIZE < ids.length) await pause(1000);
    }
  } catch (err) {
    enrichmentState.error = err instanceof Error ? err.message : 'Unknown error';
    console.error('[enrich-emails] job error:', err);
  } finally {
    enrichmentState.running = false;
    enrichmentState.currentVenue = null;
    enrichmentState.finishedAt = new Date().toISOString();
  }
}

// ── Route handler ───────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (enrichmentState.running) {
    return res.status(200).json({ message: 'Job already running', state: enrichmentState });
  }

  // Fire and forget — respond immediately
  runEnrichmentJob().catch(console.error);

  return res.status(200).json({ message: 'Enrichment job started', state: enrichmentState });
}
