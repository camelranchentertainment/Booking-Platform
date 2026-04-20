import { NextApiRequest, NextApiResponse } from 'next';
import FirecrawlApp from '@mendable/firecrawl-js';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../../../lib/supabase';

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! });
const claude    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Cached extraction prompt
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { url, venueId } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  // Validate URL
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { return res.status(400).json({ error: 'Invalid URL' }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs allowed' });
  }

  try {
    // Scrape the venue website
    const scrapeResult = await firecrawl.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
      timeout: 30000,
    });

    if (!scrapeResult.markdown) {
      return res.status(422).json({ error: 'Could not scrape that URL — no content returned' });
    }

    // Truncate to first 8000 chars — contact info is usually above the fold
    const pageText = scrapeResult.markdown.slice(0, 8000);

    // Extract structured contact info with Claude
    const message = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: EXTRACT_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{
        role: 'user',
        content: `Website URL: ${url}\n\nPage content:\n${pageText}`,
      }],
    });

    const text = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Extraction returned malformed response' });

    const extracted = JSON.parse(jsonMatch[0]);

    // If venueId provided, offer to patch the venue record
    let updated = false;
    if (venueId) {
      const patch: Record<string, any> = {};
      if (extracted.booking_email)   patch.email     = extracted.booking_email;
      else if (extracted.general_email) patch.email  = extracted.general_email;
      if (extracted.booking_phone)   patch.phone     = extracted.booking_phone;
      if (extracted.venue_name)      patch.name      = extracted.venue_name;
      if (extracted.capacity)        patch.capacity  = extracted.capacity;
      if (extracted.venue_type)      patch.venue_type = extracted.venue_type;
      if (extracted.notes)           patch.notes     = extracted.notes;

      if (Object.keys(patch).length > 0) {
        await supabase.from('venues').update(patch).eq('id', venueId);
        updated = true;
      }

      // Create a contact record if we got a name
      if (extracted.booking_contact_name) {
        const parts = (extracted.booking_contact_name as string).trim().split(/\s+/);
        const first = parts[0] ?? '';
        const last  = parts.slice(1).join(' ') || '';
        const email = extracted.booking_email || extracted.general_email || null;

        // Check if contact already exists for this venue
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('venue_id', venueId)
          .ilike('first_name', first)
          .limit(1);

        if (!existing?.length) {
          const { data: { user } } = await supabase.auth.getUser(
            req.headers.authorization?.replace('Bearer ', '')
          );
          if (user) {
            await supabase.from('contacts').insert({
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
    }

    return res.status(200).json({ extracted, updated, cached: (message.usage.cache_read_input_tokens ?? 0) > 0 });

  } catch (err: any) {
    if (err?.message?.includes('FIRECRAWL_API_KEY')) {
      return res.status(503).json({ error: 'Firecrawl not configured — add FIRECRAWL_API_KEY env var' });
    }
    return res.status(500).json({ error: err.message });
  }
}
