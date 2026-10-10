// lib/server/venueSiteScan.ts
// Reads a venue's website and extracts booking contact details: Firecrawl
// fetches the page as markdown, Claude extracts only what is explicitly stated.
// If the home page has no email, a few common contact pages are tried.
//
// Mirrors the band-side /api/venues/scrape logic but returns data only; the
// caller decides what to save and where, scoped to its own records.

import FirecrawlApp from '@mendable/firecrawl-js';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getSetting } from '../platformSettings';
import { AppError } from '../apiError';

const EXTRACT_PROMPT = `You are extracting booking/contact information from a venue website.

Return ONLY a valid JSON object with these keys (use null for anything not found):
{
  "booking_email": "primary booking or events email address",
  "general_email": "general contact email if no booking-specific one",
  "booking_phone": "phone number for bookings/events",
  "booking_contact_name": "name of booking manager, talent buyer, or events coordinator",
  "booking_contact_title": "their job title",
  "venue_name": "official venue name as shown on the site",
  "capacity": number or null,
  "notes": "any relevant booking policy notes (e.g. 'no cover bands', 'original music only', 'contact 6 weeks in advance')"
}

Only extract information explicitly stated on the page. Do not guess or infer.`;

const CONTACT_PATHS = ['/contact', '/booking', '/about', '/events', '/live-music', '/contact-us'];
const MAX_PAGES = 5;

const nullableText = (max: number) =>
  z.preprocess(v => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null), z.string().nullable());

/** Shape of what the model returns; anything malformed becomes null. */
export const ExtractedSchema = z.object({
  booking_email: z.preprocess(v => (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().toLowerCase() : null), z.string().nullable()),
  general_email: z.preprocess(v => (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().toLowerCase() : null), z.string().nullable()),
  booking_phone: nullableText(40),
  booking_contact_name: nullableText(120),
  booking_contact_title: nullableText(80),
  venue_name: nullableText(160),
  capacity: z.preprocess(v => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 200000 ? v : null), z.number().nullable()),
  notes: nullableText(2000),
});
export type Extracted = z.infer<typeof ExtractedSchema>;

/** Parses the first JSON object in a model reply; null if there is none. */
export function parseExtraction(text: string): Extracted | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return ExtractedSchema.parse(JSON.parse(match[0]));
  } catch {
    return null;
  }
}

/** Fields from `next` fill gaps in `base`; values already found are kept. */
export function mergeExtraction(base: Extracted, next: Extracted): Extracted {
  const out = { ...base };
  for (const key of Object.keys(next) as Array<keyof Extracted>) {
    if (out[key] === null && next[key] !== null) (out as Record<string, unknown>)[key] = next[key];
  }
  return out;
}

const hasEmail = (e: Extracted) => Boolean(e.booking_email || e.general_email);

/**
 * Validates that a website URL is safe to hand to the scraper.
 *
 * @throws AppError 400 for anything that is not a plain http(s) URL
 */
export function assertScannableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, 'That website address is not valid.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new AppError(400, 'Only http and https websites can be scanned.');
  return url;
}

/**
 * Scans a venue website for booking contact details.
 *
 * @returns the extracted details and how many pages were read
 * @throws AppError 400 bad URL, 501 scanning not configured, 422 nothing readable
 */
export async function scanVenueSite(rawUrl: string): Promise<{ extracted: Extracted; pagesScanned: number }> {
  const url = assertScannableUrl(rawUrl);
  const [firecrawlKey, anthropicKey] = await Promise.all([getSetting('firecrawl_api_key'), getSetting('anthropic_api_key')]);
  if (!firecrawlKey || !anthropicKey) throw new AppError(501, 'Website scanning is not configured yet. Ask the platform admin to add the scanning keys.');

  const firecrawl = new FirecrawlApp({ apiKey: firecrawlKey });
  const claude = new Anthropic({ apiKey: anthropicKey });

  const read = async (pageUrl: string): Promise<string | null> => {
    try {
      const r = await firecrawl.scrape(pageUrl, { formats: ['markdown'], onlyMainContent: true, timeout: 20000 });
      return r.markdown?.slice(0, 8000) || null;
    } catch {
      return null;
    }
  };

  const extract = async (pageText: string, first: boolean): Promise<Extracted | null> => {
    const msg = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: [{ type: 'text', text: EXTRACT_PROMPT, ...(first ? { cache_control: { type: 'ephemeral' as const } } : {}) }],
      messages: [{ role: 'user', content: `Website URL: ${url.href}\n\nPage content:\n${pageText}` }],
    });
    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    return parseExtraction(text);
  };

  const mainText = await read(url.href);
  if (!mainText) throw new AppError(422, 'Could not read that website. Check the address and try again.');
  let extracted = await extract(mainText, true);
  if (!extracted) throw new AppError(422, 'Could not find booking details on that website.');
  let pagesScanned = 1;

  if (!hasEmail(extracted)) {
    const base = `${url.protocol}//${url.host}`;
    for (const path of CONTACT_PATHS) {
      if (pagesScanned >= MAX_PAGES) break;
      const text = await read(base + path);
      if (!text) continue;
      pagesScanned++;
      const sub = await extract(text, false);
      if (!sub) continue;
      extracted = mergeExtraction(extracted, sub);
      if (hasEmail(extracted)) break;
    }
  }

  return { extracted, pagesScanned };
}
