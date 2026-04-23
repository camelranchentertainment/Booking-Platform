import { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

const SYSTEM_PROMPT = `You are an expert music booking agent assistant for Camel Ranch Entertainment.
Draft a professional cold pitch email to a venue on behalf of a booking agent.
Style: professional but human, music industry voice, concise, clear call-to-action.
Never open with "I hope this email finds you well". No em dashes or bullet points in body.
Subject lines under 60 characters.
Output ONLY valid JSON: { "subject": "...", "body": "...", "preview": "..." }`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const anthropicKey = await getSetting('anthropic_api_key');
  if (!anthropicKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

  // Find bookings with a venue that don't have a target draft yet
  const { data: existingDrafts } = await service.from('email_drafts')
    .select('booking_id')
    .eq('agent_id', user.id)
    .eq('category', 'target');

  const alreadyDrafted = new Set((existingDrafts || []).map(d => d.booking_id));

  const { data: bookings } = await service.from('bookings')
    .select(`
      id, act_id, venue_id, tour_id, show_date,
      act:acts(act_name, genre, bio, website, spotify),
      venue:venues(name, city, state, capacity),
      contact:contacts(first_name, last_name, email)
    `)
    .not('venue_id', 'is', null)
    .not('act_id', 'is', null)
    .neq('status', 'cancelled')
    .neq('status', 'completed')
    .limit(30);

  const missing = (bookings || []).filter(b => !alreadyDrafted.has(b.id));

  if (missing.length === 0) {
    return res.status(200).json({ created: 0, message: 'All bookings already have drafts.' });
  }

  const { data: profile } = await service.from('user_profiles')
    .select('display_name, agency_name').eq('id', user.id).single();

  const client = new Anthropic({ apiKey: anthropicKey });
  let created = 0;

  for (const b of missing) {
    try {
      const act = b.act as any;
      const venue = b.venue as any;
      const contact = b.contact as any;

      // Fetch tour date range if applicable
      let tourDateRange = '';
      if (b.tour_id) {
        const [tourRes, bookedRes] = await Promise.all([
          service.from('tours').select('start_date, end_date').eq('id', b.tour_id).single(),
          service.from('bookings').select('show_date').eq('tour_id', b.tour_id).neq('status', 'cancelled').not('show_date', 'is', null),
        ]);
        if (tourRes.data?.start_date) {
          const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          const booked = (bookedRes.data || []).filter(r => r.show_date !== b.show_date).map(r => fmt(r.show_date));
          tourDateRange = `${fmt(tourRes.data.start_date)} through ${tourRes.data.end_date ? fmt(tourRes.data.end_date) : 'TBD'}`;
          if (booked.length) tourDateRange += ` (${booked.join(', ')} already booked)`;
        }
      }

      const from = `${profile?.display_name || 'the booking agent'}${profile?.agency_name ? ` at ${profile.agency_name}` : ' at Camel Ranch Booking'}`;
      const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'the booking manager' : 'the booking manager';

      const prompt = `Write a cold pitch booking email to ${contactName} at ${venue.name} about booking ${act?.act_name || 'this act'}.

From: ${from}
Act: ${act?.act_name || 'Unknown'}${act?.genre ? `\nGenre: ${act.genre}` : ''}${act?.bio ? `\nBio: ${act.bio}` : ''}${act?.website ? `\nWebsite: ${act.website}` : ''}
Note: describe the act as maintaining a solid regional following
Venue: ${venue.name}${venue.city ? `\nLocation: ${venue.city}, ${venue.state}` : ''}${venue.capacity ? `\nCapacity: ~${venue.capacity}` : ''}
${tourDateRange ? `Available dates: ${tourDateRange}` : 'Available dates: [AGENT: add specific dates here]'}

Introduce the act in 2 sentences. Ask them to hold a date. Under 150 words. Include website link if available.`;

      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content.find((bl): bl is Anthropic.TextBlock => bl.type === 'text')?.text ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const draft = JSON.parse(jsonMatch[0]);
      await service.from('email_drafts').upsert({
        booking_id: b.id,
        category:   'target',
        subject:    draft.subject,
        body:       draft.body,
        agent_id:   user.id,
      }, { onConflict: 'booking_id,category' });

      created++;
    } catch {
      // Skip individual failures, continue with rest
    }
  }

  return res.status(200).json({ created, total: missing.length });
}
