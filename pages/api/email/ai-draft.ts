import { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../../../lib/supabase';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Stable system prompt — cached across all requests
const SYSTEM_PROMPT = `You are an expert music booking agent assistant for Camel Ranch Entertainment.
You draft professional, personable emails for booking music acts at venues: cold pitches, follow-ups, and replies to venue responses.

Style:
- Professional but warm and human — not corporate
- Concise — venue managers are busy, keep body under 200 words
- Lead with the act's most compelling hook (genre, draw, recent gigs)
- Always include a clear call-to-action
- Subject lines under 60 characters — specific, not generic
- Do NOT use em dashes or bullet points in the email body

Output: Return ONLY a valid JSON object with these exact keys:
{
  "subject": "email subject line",
  "body": "plain email body text — no HTML tags",
  "preview": "one sentence summary"
}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { type, actId, venueId, contactId, previousEmail, agentName, agencyName } = req.body;
  if (!type || !actId) return res.status(400).json({ error: 'type and actId required' });

  const [actRes, venueRes, contactRes] = await Promise.all([
    supabase.from('acts').select('*').eq('id', actId).single(),
    venueId ? supabase.from('venues').select('*').eq('id', venueId).single() : Promise.resolve({ data: null }),
    contactId ? supabase.from('contacts').select('*').eq('id', contactId).single() : Promise.resolve({ data: null }),
  ]);

  if (!actRes.data) return res.status(404).json({ error: 'Act not found' });
  const act = actRes.data;
  const venue = venueRes.data;
  const contact = contactRes.data;

  const prompt = buildPrompt({ type, act, venue, contact, previousEmail, agentName, agencyName });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI returned malformed response' });

    const draft = JSON.parse(jsonMatch[0]);
    return res.status(200).json({
      draft,
      cached: (message.usage.cache_read_input_tokens ?? 0) > 0,
    });
  } catch (err: any) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Rate limited — try again shortly' });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `AI error: ${err.message}` });
    return res.status(500).json({ error: err.message });
  }
}

function buildPrompt({ type, act, venue, contact, previousEmail, agentName, agencyName }: any): string {
  const lines = (arr: (string | false | null | undefined)[]) => arr.filter(Boolean).join('\n');

  const actInfo = lines([
    `Act: ${act.act_name}`,
    act.genre && `Genre: ${act.genre}`,
    act.bio && `Bio: ${act.bio}`,
    act.member_count > 1 && `Members: ${act.member_count}`,
    act.website && `Website: ${act.website}`,
    act.spotify && `Spotify: ${act.spotify}`,
    act.instagram && `Instagram: ${act.instagram}`,
  ]);

  const venueInfo = venue
    ? lines([
        `Venue: ${venue.name}`,
        venue.city && venue.state && `Location: ${venue.city}, ${venue.state}`,
        venue.venue_type && `Type: ${venue.venue_type}`,
        venue.capacity && `Capacity: ~${venue.capacity}`,
      ])
    : 'Venue: not specified';

  const contactLine = contact
    ? `Contact: ${contact.first_name} ${contact.last_name}${contact.title ? ` (${contact.title})` : ''}`
    : '';

  const agentLine = `From: ${agentName || 'the booking agent'}${agencyName ? ` — ${agencyName}` : ''}`;

  if (type === 'cold_pitch') {
    return `Write a cold pitch email to book ${act.act_name} at this venue. First contact — no prior relationship.

${agentLine}
${actInfo}
${venueInfo}
${contactLine}`;
  }

  if (type === 'followup') {
    return `We pitched ${act.act_name} to this venue about a week ago and haven't heard back. Write a brief, friendly follow-up.

${agentLine}
${actInfo}
${venueInfo}
${contactLine}
${previousEmail ? `\nOriginal pitch subject: "${previousEmail.subject}"` : ''}

Keep it very short — just a gentle check-in.`;
  }

  if (type === 'reply_suggestion') {
    return `The venue responded to our pitch for ${act.act_name}. Write a reply that moves toward booking.

${agentLine}
${actInfo}
${venueInfo}
${contactLine}

Venue's response:
"${previousEmail?.body ?? 'They expressed interest in the act.'}"`;
  }

  return `Write a professional booking email for ${act.act_name}.\n\n${agentLine}\n${actInfo}\n${venueInfo}`;
}
