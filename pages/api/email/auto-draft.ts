import { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

const SYSTEM_PROMPT = `You are an expert music booking assistant for Camel Ranch Booking.
You draft professional, concise cold pitch emails to venues on behalf of bands and their management.

Style:
- Professional but human — not corporate
- Music industry voice
- Short paragraphs, no walls of text
- Clear call-to-action
- Never open with "I hope this email finds you well"
- No em dashes, no bullet points in the body
- Subject lines under 60 characters

Output: Return ONLY a valid JSON object:
{ "subject": "...", "body": "...", "preview": "..." }`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { bookingId } = req.body;
  if (!bookingId) return res.status(400).json({ error: 'bookingId required' });

  // Auth
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Fetch booking + related data
  const { data: booking } = await service.from('bookings')
    .select(`
      id, act_id, venue_id, tour_id, show_date,
      act:acts(act_name, genre, bio, website, spotify, instagram),
      venue:venues(name, city, state, email, capacity),
      contact:contacts(first_name, last_name, email)
    `)
    .eq('id', bookingId)
    .single();

  if (!booking?.venue_id) {
    return res.status(400).json({ error: 'Booking has no venue — cannot draft' });
  }

  // Fetch agent profile
  const { data: profile } = await service.from('user_profiles')
    .select('display_name, agency_name')
    .eq('id', user.id)
    .single();

  // Fetch tour dates if available
  let tourDateRange = '';
  if (booking.tour_id) {
    const [tourRes, bookedRes] = await Promise.all([
      service.from('tours').select('start_date, end_date').eq('id', booking.tour_id).single(),
      service.from('bookings').select('show_date').eq('tour_id', booking.tour_id).neq('status', 'cancelled').not('show_date', 'is', null),
    ]);
    if (tourRes.data?.start_date) {
      const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const booked = (bookedRes.data || []).filter(r => r.show_date !== booking.show_date).map(r => fmt(r.show_date));
      tourDateRange = `${fmt(tourRes.data.start_date)} through ${tourRes.data.end_date ? fmt(tourRes.data.end_date) : 'TBD'}`;
      if (booked.length) tourDateRange += ` (${booked.join(', ')} already booked)`;
    }
  }

  const act = booking.act as any;
  const venue = booking.venue as any;
  const contact = booking.contact as any;

  const contactName = contact
    ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'the booking manager'
    : 'the booking manager';

  const from = profile?.display_name || (booking.act as any)?.act_name ? `${(booking.act as any)?.act_name} Management` : 'Camel Ranch Booking';

  const actInfo = [
    `Act: ${act?.act_name || 'Unknown'}`,
    act?.genre && `Genre: ${act.genre}`,
    act?.bio && `Bio: ${act.bio}`,
    act?.website && `Website: ${act.website}`,
    act?.spotify && `Spotify: ${act.spotify}`,
    'Note: describe the act as maintaining a solid regional following',
  ].filter(Boolean).join('\n');

  const venueInfo = [
    `Venue: ${venue.name}`,
    venue.city && `Location: ${venue.city}, ${venue.state}`,
    venue.capacity && `Capacity: ~${venue.capacity}`,
  ].filter(Boolean).join('\n');

  const availableDates = tourDateRange
    ? `Available dates: ${tourDateRange}`
    : 'Available dates: [add specific dates here]';

  const prompt = `Write a cold pitch booking email to ${contactName} at ${venue.name} about booking ${act?.act_name || 'this act'}.

From: ${from}
${actInfo}
${venueInfo}
${availableDates}

Introduce the act in 2 sentences. Ask them to hold a date. Keep it under 150 words. Include website link if available.`;

  const anthropicKey = await getSetting('anthropic_api_key');
  if (!anthropicKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

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

    // Upsert draft into email_drafts
    await service.from('email_drafts').upsert({
      booking_id: bookingId,
      category:   'target',
      subject:    draft.subject,
      body:       draft.body,
      agent_id: user.id,
    }, { onConflict: 'booking_id,category' });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
