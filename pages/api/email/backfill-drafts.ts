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

async function buildPrompt(act: any, venue: any, contact: any, profile: any, tourDateRange: string) {
  const from = `${profile?.display_name || 'the booking agent'}${profile?.agency_name ? ` at ${profile.agency_name}` : ' at Camel Ranch Booking'}`;
  const contactName = contact
    ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'the booking manager'
    : 'the booking manager';

  const actInfo = [
    `Act: ${act?.act_name || 'Unknown'}`,
    act?.genre   && `Genre: ${act.genre}`,
    act?.bio     && `Bio: ${act.bio}`,
    act?.website && `Website: ${act.website}`,
    act?.spotify && `Spotify: ${act.spotify}`,
    'Note: describe the act as maintaining a solid regional following',
  ].filter(Boolean).join('\n');

  const venueInfo = [
    `Venue: ${venue.name}`,
    venue.city && `Location: ${venue.city}, ${venue.state}`,
    venue.capacity && `Capacity: ~${venue.capacity}`,
  ].filter(Boolean).join('\n');

  return `Write a cold pitch booking email to ${contactName} at ${venue.name} about booking ${act?.act_name || 'this act'}.

From: ${from}
${actInfo}
${venueInfo}
${tourDateRange ? `Available dates: ${tourDateRange}` : 'Available dates: [AGENT: add specific dates here]'}

Introduce the act in 2 sentences. Ask them to hold a date. Under 150 words. Include website link if available.`;
}

async function getTourDateRange(service: any, tourId: string, excludeShowDate?: string): Promise<string> {
  const [tourRes, bookedRes] = await Promise.all([
    service.from('tours').select('start_date, end_date').eq('id', tourId).single(),
    service.from('bookings').select('show_date').eq('tour_id', tourId).neq('status', 'cancelled').not('show_date', 'is', null),
  ]);
  if (!tourRes.data?.start_date) return '';
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const booked = (bookedRes.data || []).filter((r: any) => r.show_date !== excludeShowDate).map((r: any) => fmt(r.show_date));
  let range = `${fmt(tourRes.data.start_date)} through ${tourRes.data.end_date ? fmt(tourRes.data.end_date) : 'TBD'}`;
  if (booked.length) range += ` (${booked.join(', ')} already booked)`;
  return range;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const anthropicKey = await getSetting('anthropic_api_key');
  if (!anthropicKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

  // Find the user's act (owner or via profile)
  let actId: string | null = null;
  const { data: owned } = await service.from('acts').select('id').eq('owner_id', user.id).eq('is_active', true).limit(1);
  if (owned?.length) {
    actId = owned[0].id;
  } else {
    const { data: prof } = await service.from('user_profiles').select('act_id').eq('id', user.id).maybeSingle();
    actId = prof?.act_id || null;
  }

  // Also include acts where user is the agent
  const { data: agentActs } = await service.from('acts').select('id').eq('agent_id', user.id).eq('is_active', true);
  const actIds = [...new Set([actId, ...(agentActs || []).map((a: any) => a.id)].filter(Boolean))];

  if (actIds.length === 0) return res.status(200).json({ created: 0, message: 'No acts found for this account.' });

  const [profile] = await Promise.all([
    service.from('user_profiles').select('display_name, agency_name').eq('id', user.id).single().then(r => r.data),
  ]);

  // Find existing drafts created by this user
  const { data: existingDrafts } = await service.from('email_drafts').select('booking_id, tour_venue_id, category').eq('agent_id', user.id).eq('category', 'target');
  const draftedBookings = new Set((existingDrafts || []).filter((d: any) => d.booking_id).map((d: any) => d.booking_id));
  const draftedTourVenues = new Set((existingDrafts || []).filter((d: any) => d.tour_venue_id).map((d: any) => d.tour_venue_id));

  const client = new Anthropic({ apiKey: anthropicKey });
  let created = 0;

  // --- 1. Bookings with venue_id ---
  const { data: bookings } = await service.from('bookings')
    .select(`id, act_id, venue_id, tour_id, show_date,
      act:acts(act_name, genre, bio, website, spotify),
      venue:venues(name, city, state, capacity),
      contact:contacts(first_name, last_name, email)`)
    .in('act_id', actIds)
    .not('venue_id', 'is', null)
    .neq('status', 'cancelled')
    .neq('status', 'completed')
    .limit(20);

  for (const b of (bookings || []).filter((b: any) => !draftedBookings.has(b.id))) {
    try {
      const tourDateRange = b.tour_id ? await getTourDateRange(service, b.tour_id, b.show_date) : '';
      const prompt = await buildPrompt(b.act, b.venue, b.contact, profile, tourDateRange);
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 1024,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      });
      const text = message.content.find((bl): bl is Anthropic.TextBlock => bl.type === 'text')?.text ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;
      const draft = JSON.parse(jsonMatch[0]);
      await service.from('email_drafts').upsert(
        { booking_id: b.id, tour_venue_id: null, category: 'target', subject: draft.subject, body: draft.body, agent_id: user.id },
        { onConflict: 'booking_id,category' }
      );
      created++;
    } catch { /* skip individual failures */ }
  }

  // --- 2. Tour venues (outreach pool) without bookings ---
  const { data: tours } = await service.from('tours').select('id, start_date, end_date').in('act_id', actIds);
  const tourIds = (tours || []).map((t: any) => t.id);

  if (tourIds.length > 0) {
    const { data: tourVenues } = await service.from('tour_venues')
      .select(`id, venue_id, tour_id,
        venue:venues(name, city, state, capacity, email),
        contact:contacts(first_name, last_name, email)`)
      .in('tour_id', tourIds)
      .neq('status', 'declined')
      .limit(20);

    for (const tv of (tourVenues || []).filter((tv: any) => !draftedTourVenues.has(tv.id))) {
      try {
        // Find act for this tour
        const { data: tourData } = await service.from('tours').select('act_id, start_date, end_date, acts(act_name, genre, bio, website, spotify)').eq('id', tv.tour_id).single();
        if (!tourData) continue;

        const act = (tourData as any).acts;
        const tourDateRange = await getTourDateRange(service, tv.tour_id);

        const prompt = await buildPrompt(act, tv.venue, tv.contact, profile, tourDateRange);
        const message = await client.messages.create({
          model: 'claude-sonnet-4-6', max_tokens: 1024,
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: prompt }],
        });
        const text = message.content.find((bl): bl is Anthropic.TextBlock => bl.type === 'text')?.text ?? '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;
        const draft = JSON.parse(jsonMatch[0]);
        await service.from('email_drafts').insert({
          booking_id: null,
          tour_venue_id: tv.id,
          category: 'target',
          subject: draft.subject,
          body: draft.body,
          agent_id: user.id,
        });
        created++;
      } catch { /* skip individual failures */ }
    }
  }

  return res.status(200).json({ created, total: created });
}
