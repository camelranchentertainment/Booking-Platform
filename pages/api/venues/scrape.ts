import { NextApiRequest, NextApiResponse } from 'next';
import FirecrawlApp from '@mendable/firecrawl-js';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

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
  "venue_type": "bar|club|concert_hall|restaurant|winery|outdoor|theater|festival|other or null",
  "notes": "any relevant booking policy notes (e.g. 'no cover bands', 'original music only', 'contact 6 weeks in advance')"
}

Only extract information explicitly stated on the page. Do not guess or infer.`;

// Sub-pages most likely to have booking contact info
const CONTACT_PATHS = ['/contact', '/about', '/booking', '/book', '/events', '/live-music', '/entertainment', '/contact-us', '/about-us'];

async function scrapeUrl(firecrawl: FirecrawlApp, url: string): Promise<string | null> {
  try {
    const result = await firecrawl.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
      timeout: 20000,
    });
    return result.markdown?.slice(0, 8000) || null;
  } catch {
    return null;
  }
}

function hasEmail(extracted: Record<string, any>): boolean {
  return !!(extracted.booking_email || extracted.general_email);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Auth check — required to save contacts/venues
  const token = req.headers.authorization?.replace('Bearer ', '');
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token || '');
  if (!user) return res.status(401).json({ error: 'Session expired — please refresh the page and try again' });

  const { url, venueId } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  let parsed: URL;
  try { parsed = new URL(url); }
  catch { return res.status(400).json({ error: 'Invalid URL' }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs allowed' });
  }

  const [firecrawlKey, anthropicKey] = await Promise.all([
    getSetting('firecrawl_api_key'),
    getSetting('anthropic_api_key'),
  ]);
  if (!firecrawlKey) return res.status(500).json({ error: 'Venue scraping not configured. Add your Firecrawl API key in Settings.' });
  if (!anthropicKey) return res.status(500).json({ error: 'AI not configured. Add your Anthropic API key in Settings.' });

  const firecrawl = new FirecrawlApp({ apiKey: firecrawlKey });
  const claude    = new Anthropic({ apiKey: anthropicKey });

  const extract = async (pageText: string, isFirst: boolean) => {
    const msg = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: EXTRACT_PROMPT,
          // Only cache on the first call; subsequent calls reuse the cached prompt
          ...(isFirst ? { cache_control: { type: 'ephemeral' } } : {}),
        },
      ],
      messages: [{ role: 'user', content: `Website URL: ${url}\n\nPage content:\n${pageText}` }],
    });
    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  };

  try {
    // --- Pass 1: scrape the main URL ---
    const mainText = await scrapeUrl(firecrawl, url);
    if (!mainText) return res.status(422).json({ error: 'Could not scrape that URL — no content returned' });

    let extracted = await extract(mainText, true);
    let pagesScraped = 1;

    // --- Pass 2: try sub-pages if no email found yet ---
    if (extracted && !hasEmail(extracted)) {
      const base = `${parsed.protocol}//${parsed.host}`;

      for (const path of CONTACT_PATHS) {
        const subUrl = base + path;
        const subText = await scrapeUrl(firecrawl, subUrl);
        if (!subText) continue;
        pagesScraped++;

        const subExtracted = await extract(subText, false);
        if (subExtracted && hasEmail(subExtracted)) {
          // Merge: sub-page email wins; keep any other fields from main if sub is null
          extracted = { ...extracted, ...Object.fromEntries(
            Object.entries(subExtracted).filter(([, v]) => v !== null)
          )};
          break;
        }

        if (pagesScraped >= 5) break; // safety limit
      }
    }

    if (!extracted) return res.status(500).json({ error: 'Extraction returned malformed response' });

    // --- Persist to DB if venueId provided — use service client to bypass RLS ---
    let updated = false;
    if (venueId) {
      const patch: Record<string, any> = {
        last_enriched_at: new Date().toISOString(),
      };
      if (extracted.booking_email)      patch.email      = extracted.booking_email;
      else if (extracted.general_email) patch.email      = extracted.general_email;
      if (extracted.booking_phone)      patch.phone      = extracted.booking_phone;
      if (extracted.venue_name)         patch.name       = extracted.venue_name;
      if (extracted.capacity)           patch.capacity   = extracted.capacity;
      if (extracted.venue_type)         patch.venue_type = extracted.venue_type;
      if (extracted.notes)              patch.notes      = extracted.notes;

      const { error: patchErr } = await service.from('venues').update(patch).eq('id', venueId);

      // If last_enriched_at column doesn't exist yet, retry without it
      if (patchErr) {
        const { last_enriched_at: _dropped, ...patchWithoutEnriched } = patch;
        if (Object.keys(patchWithoutEnriched).length > 0) {
          await service.from('venues').update(patchWithoutEnriched).eq('id', venueId);
        }
      }

      updated = true;

      if (extracted.booking_contact_name) {
        const parts = (extracted.booking_contact_name as string).trim().split(/\s+/);
        const first = parts[0] ?? '';
        const last  = parts.slice(1).join(' ') || '';
        const email = extracted.booking_email || extracted.general_email || null;

        const { data: existing } = await service
          .from('contacts')
          .select('id')
          .eq('venue_id', venueId)
          .ilike('first_name', first)
          .limit(1);

        if (!existing?.length) {
          await service.from('contacts').insert({
            agent_id:   user.id,
            venue_id:   venueId,
            first_name: first,
            last_name:  last,
            title:      extracted.booking_contact_title || null,
            email,
            phone:      extracted.booking_phone || null,
            status:     'not_contacted',
          });
        }
      }
    }

    return res.status(200).json({ extracted, updated, pagesScraped });

  } catch (err: any) {
    const msg: string = err?.message ?? '';
    if (msg.includes('FIRECRAWL_API_KEY')) {
      return res.status(503).json({ error: 'Firecrawl not configured — add FIRECRAWL_API_KEY env var' });
    }
    if (msg.toLowerCase().includes('x-api-key') || msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('invalid api key')) {
      return res.status(401).json({ error: 'Firecrawl API key is invalid or expired. Go to Settings → API Keys and update your Firecrawl key.' });
    }
    return res.status(500).json({ error: msg || 'Scan failed' });
  }
}
