import { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

const SYSTEM_PROMPT = `You are an expert music booking agent assistant for Camel Ranch Entertainment.
You draft professional, concise emails for booking music acts at venues.

Style:
- Professional but human — not corporate
- Music industry voice, not generic business speak
- Short paragraphs, no walls of text
- Always include a clear call-to-action
- Never open with "I hope this email finds you well" or similar filler
- No em dashes, no bullet points in the body
- Subject lines under 60 characters

Output: Return ONLY a valid JSON object with these exact keys:
{
  "subject": "email subject line",
  "body": "plain email body text — no HTML tags",
  "preview": "one sentence summary of the email"
}`;

type Category = 'target' | 'follow_up_1' | 'follow_up_2' | 'confirmation' | 'decline' | 'advance' | 'thank_you' | 'reply';

const TYPE_TO_CATEGORY: Record<string, Category> = {
  cold_pitch:       'target',
  followup:         'follow_up_1',
  reply_suggestion: 'reply',
  target:           'target',
  follow_up_1:      'follow_up_1',
  follow_up_2:      'follow_up_2',
  confirmation:     'confirmation',
  decline:          'decline',
  advance:          'advance',
  thank_you:        'thank_you',
  reply:            'reply',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { category: rawCategory, type: rawType, bookingId, actId: bodyActId, venueId: bodyVenueId, contactId, agentName, agencyName } = req.body;
  const rawInput = rawCategory || rawType;
  if (!rawInput) return res.status(400).json({ error: 'category required' });
  const category = TYPE_TO_CATEGORY[rawInput] ?? (rawInput as Category);

  const service = getServiceClient();

  // If bookingId provided, fetch booking and resolve act/venue/tour
  let booking: any = null;
  let resolvedActId = bodyActId;
  let resolvedVenueId = bodyVenueId;
  let tourDateRange: string | null = null;

  if (bookingId) {
    const { data: b } = await service.from('bookings').select('*').eq('id', bookingId).single();
    if (b) {
      booking = b;
      resolvedActId = resolvedActId || b.act_id;
      resolvedVenueId = resolvedVenueId || b.venue_id;

      // Fetch tour date range for target/follow_up categories
      if (b.tour_id && (category === 'target' || category === 'follow_up_1' || category === 'follow_up_2')) {
        const [tourRes, tourBookingsRes] = await Promise.all([
          service.from('tours').select('name, start_date, end_date').eq('id', b.tour_id).single(),
          service.from('bookings').select('show_date').eq('tour_id', b.tour_id).neq('status', 'cancelled').not('show_date', 'is', null),
        ]);
        if (tourRes.data?.start_date) {
          const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          const start = fmt(tourRes.data.start_date);
          const end = tourRes.data.end_date ? fmt(tourRes.data.end_date) : 'TBD';
          const booked = (tourBookingsRes.data || []).filter(r => r.show_date !== b.show_date).map(r => fmt(r.show_date));
          tourDateRange = `${start} through ${end}`;
          if (booked.length) tourDateRange += ` (${booked.join(', ')} already booked)`;
        }
      }
    }
  }

  if (!resolvedActId) return res.status(400).json({ error: 'actId or bookingId required' });

  const [actRes, venueRes, contactRes] = await Promise.all([
    service.from('acts').select('*').eq('id', resolvedActId).single(),
    resolvedVenueId ? service.from('venues').select('*').eq('id', resolvedVenueId).single() : Promise.resolve({ data: null }),
    contactId ? service.from('contacts').select('*').eq('id', contactId).single() : Promise.resolve({ data: null }),
  ]);

  if (!actRes.data) return res.status(404).json({ error: 'Act not found' });

  const prompt = buildPrompt({
    category: category as Category,
    act: actRes.data,
    venue: venueRes.data,
    contact: contactRes.data,
    booking,
    tourDateRange,
    agentName,
    agencyName,
  });

  const anthropicKey = await getSetting('anthropic_api_key');
  if (!anthropicKey) return res.status(500).json({ error: 'AI not configured. Add your Anthropic API key in Settings.' });

  const client = new Anthropic({ apiKey: anthropicKey });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI returned malformed response' });

    const draft = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ draft, cached: (message.usage.cache_read_input_tokens ?? 0) > 0 });
  } catch (err: any) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Rate limited — try again shortly' });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `AI error: ${err.message}` });
    return res.status(500).json({ error: err.message });
  }
}

function buildPrompt({ category, act, venue, contact, booking, tourDateRange, agentName, agencyName }: {
  category: Category; act: any; venue: any; contact: any; booking: any;
  tourDateRange: string | null; agentName?: string; agencyName?: string;
}): string {
  const lines = (arr: (string | false | null | undefined)[]) => arr.filter(Boolean).join('\n');

  const from = `From: ${agentName || 'the booking agent'}${agencyName ? ` at ${agencyName}` : ''}`;

  const actInfo = lines([
    `Act: ${act.act_name}`,
    act.genre && `Genre: ${act.genre}`,
    act.bio && `Bio: ${act.bio}`,
    act.website && `Website: ${act.website}`,
    act.spotify && `Spotify: ${act.spotify}`,
    act.instagram && `Instagram: ${act.instagram}`,
    'Note: describe the act as maintaining a solid regional following',
  ]);

  const venueInfo = venue ? lines([
    `Venue: ${venue.name}`,
    venue.city && venue.state && `Location: ${venue.city}, ${venue.state}`,
    venue.capacity && `Capacity: ~${venue.capacity}`,
  ]) : 'Venue: not specified';

  const contactName = contact
    ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'the booking manager'
    : 'the booking manager';

  const showDate = booking?.show_date
    ? new Date(booking.show_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const availableDates = tourDateRange
    ? `Available dates: ${tourDateRange}`
    : 'Available dates: [add specific dates here]';

  switch (category) {
    case 'target':
      return `Write a cold pitch booking email to ${contactName} at ${venue?.name || 'this venue'} about booking ${act.act_name}.

${from}
${actInfo}
${venueInfo}
${availableDates}

Introduce the act in 2 sentences. Ask them to hold a date. Keep it under 150 words. Include the EPK/website link if available.`;

    case 'follow_up_1':
      return `Write a brief follow-up email to ${contactName} at ${venue?.name || 'this venue'}. We pitched ${act.act_name} about a week ago with no response.

${from}
${actInfo}
${venueInfo}
${availableDates}

Reference the original outreach without being pushy. Light, professional tone. Under 100 words.`;

    case 'follow_up_2':
      return `Write a second follow-up email to ${contactName} at ${venue?.name || 'this venue'} about booking ${act.act_name}. Two weeks since first contact, still no reply.

${from}
${actInfo}
${venueInfo}
${availableDates}

This is the last outreach. Keep it brief and gracious — leave the door open even if they're not interested right now. Under 80 words.`;

    case 'confirmation':
      return `Write a booking confirmation email to ${contactName} at ${venue?.name || 'this venue'} confirming ${act.act_name}${showDate ? ` on ${showDate}` : ''}.

${from}
${venueInfo}

Confirm the date is locked. Mention that a contract will follow and advance details will be sent 14 days before the show. Thank them for their response. Professional and concise.`;

    case 'decline':
      return `Write a graceful response to ${contactName} at ${venue?.name || 'this venue'} — they passed on booking ${act.act_name}.

${from}
${actInfo}
${venueInfo}

Thank them for their time. Keep the relationship warm. Mention ${act.act_name} will be routing through the area again. No bitterness, no over-explanation. Under 80 words.`;

    case 'advance':
      return `Write a 14-day advance email to ${contactName} at ${venue?.name || 'this venue'} for the upcoming ${act.act_name} show${showDate ? ` on ${showDate}` : ''}.

${from}
${venueInfo}

Request confirmation on: load-in time, sound check time, PA/backline provided, promotional status (socials, posters), door time, set length, and payment logistics. Use a short list format for the questions. Professional and efficient.`;

    case 'thank_you':
      return `Write a post-show thank you email to ${contactName} at ${venue?.name || 'this venue'} following the ${act.act_name} show${showDate ? ` on ${showDate}` : ''}.

${from}
${venueInfo}

Thank them for the hospitality. Keep it warm but brief. Mention you'd love to bring ${act.act_name} back and will be in touch when routing through again. Under 100 words.`;

    case 'reply':
      return `Write a professional reply email to ${contactName} at ${venue?.name || 'this venue'}, responding to their message about booking ${act.act_name}.

${from}
${actInfo}
${venueInfo}
${availableDates}

Keep the momentum going. If they're interested, propose next steps (confirm the date, send contract). If they asked questions, answer clearly. Professional, warm, and brief. Under 120 words.`;

    default:
      return `Write a professional booking email for ${act.act_name} to ${venue?.name || 'this venue'}.\n\n${from}\n${actInfo}\n${venueInfo}`;
  }
}
