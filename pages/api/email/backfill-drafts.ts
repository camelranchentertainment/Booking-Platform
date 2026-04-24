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

async function getTourDateRange(service: any, tourId: string): Promise<string> {
  const [tourRes, bookedRes] = await Promise.all([
    service.from('tours').select('start_date, end_date').eq('id', tourId).single(),
    service.from('bookings').select('show_date').eq('tour_id', tourId).neq('status', 'cancelled').not('show_date', 'is', null),
  ]);
  if (!tourRes.data?.start_date) return '';
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const booked = (bookedRes.data || []).map((r: any) => fmt(r.show_date));
  let range = `${fmt(tourRes.data.start_date)} through ${tourRes.data.end_date ? fmt(tourRes.data.end_date) : 'TBD'}`;
  if (booked.length) range += ` (${booked.join(', ')} already booked)`;
  return range;
}

function buildPrompt(act: any, venue: any, contactName: string, agentFrom: string, tourDateRange: string): string {
  const actInfo = [
    `Act: ${act?.act_name || 'Unknown'}`,
    act?.genre   && `Genre: ${act.genre}`,
    act?.bio     && `Bio: ${act.bio}`,
    act?.website && `Website: ${act.website}`,
    'Note: describe the act as maintaining a solid regional following',
  ].filter(Boolean).join('\n');

  const venueInfo = [
    `Venue: ${venue.name}`,
    venue.city && `Location: ${venue.city}, ${venue.state}`,
    venue.capacity && `Capacity: ~${venue.capacity}`,
  ].filter(Boolean).join('\n');

  return `Write a cold pitch booking email to ${contactName} at ${venue.name} about booking ${act?.act_name || 'this act'}.

From: ${agentFrom}
${actInfo}
${venueInfo}
${tourDateRange ? `Available dates: ${tourDateRange}` : 'Available dates: [AGENT: add specific dates here]'}

Introduce the act in 2 sentences. Ask them to hold a date. Under 150 words. Include website link if available.`;
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

  // Find the user's act (owner first, then profile linkage)
  let actId: string | null = null;
  const { data: owned } = await service.from('acts').select('id').eq('owner_id', user.id).eq('is_active', true).limit(1);
  if (owned?.length) {
    actId = owned[0].id;
  } else {
    const { data: prof } = await service.from('user_profiles').select('act_id').eq('id', user.id).maybeSingle();
    actId = prof?.act_id || null;
  }

  // Also collect acts where user is the booking agent
  const { data: agentActs } = await service.from('acts').select('id').eq('agent_id', user.id).eq('is_active', true);
  const actIds = [...new Set([actId, ...(agentActs || []).map((a: any) => a.id)].filter(Boolean))] as string[];

  if (actIds.length === 0) {
    return res.status(200).json({ created: 0, message: 'No acts found for this account.' });
  }

  const { data: profile } = await service.from('user_profiles').select('display_name, agency_name').eq('id', user.id).single();
  const agentFrom = `${profile?.display_name || 'the booking agent'}${profile?.agency_name ? ` at ${profile.agency_name}` : ' at Camel Ranch Booking'}`;

  const client = new Anthropic({ apiKey: anthropicKey });
  let created = 0;
  const errors: string[] = [];

  // Find which items already have drafts from this user
  const { data: existingDrafts } = await service.from('email_drafts')
    .select('booking_id, tour_venue_id')
    .eq('agent_id', user.id)
    .eq('category', 'target');
  const draftedBookings   = new Set((existingDrafts || []).filter((d: any) => d.booking_id).map((d: any) => d.booking_id));
  const draftedTourVenues = new Set((existingDrafts || []).filter((d: any) => d.tour_venue_id).map((d: any) => d.tour_venue_id));

  // --- 1. Bookings with a venue ---
  const { data: bookings, error: bookingsErr } = await service.from('bookings')
    .select(`id, act_id, venue_id, tour_id, show_date,
      act:acts(act_name, genre, bio, website),
      venue:venues(name, city, state, capacity)`)
    .in('act_id', actIds)
    .not('venue_id', 'is', null)
    .neq('status', 'cancelled')
    .neq('status', 'completed')
    .limit(20);

  if (bookingsErr) errors.push(`Bookings query: ${bookingsErr.message}`);

  for (const b of (bookings || []).filter((b: any) => !draftedBookings.has(b.id))) {
    try {
      // Get primary contact for the venue
      const { data: contacts } = await service.from('contacts').select('first_name, last_name, email').eq('venue_id', b.venue_id).limit(1);
      const contact = contacts?.[0];
      const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'the booking manager' : 'the booking manager';
      const tourDateRange = b.tour_id ? await getTourDateRange(service, b.tour_id) : '';

      const message = await client.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 1024,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildPrompt(b.act, b.venue, contactName, agentFrom, tourDateRange) }],
      });
      const text = message.content.find((bl): bl is Anthropic.TextBlock => bl.type === 'text')?.text ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) { errors.push(`Claude returned no JSON for booking ${b.id}`); continue; }
      const draft = JSON.parse(match[0]);
      const { error: insertErr } = await service.from('email_drafts').upsert(
        { booking_id: b.id, tour_venue_id: null, category: 'target', subject: draft.subject, body: draft.body, agent_id: user.id },
        { onConflict: 'booking_id,category' }
      );
      if (insertErr) { errors.push(`Insert booking draft ${b.id}: ${insertErr.message}`); continue; }
      created++;
    } catch (e: any) {
      errors.push(`Booking ${b.id}: ${e.message}`);
    }
  }

  // --- 2. Tour venues (outreach pool) ---
  const { data: tours, error: toursErr } = await service.from('tours')
    .select('id, act_id, act:acts(act_name, genre, bio, website)')
    .in('act_id', actIds);
  if (toursErr) errors.push(`Tours query: ${toursErr.message}`);

  const tourIds = (tours || []).map((t: any) => t.id);

  if (tourIds.length > 0) {
    const { data: tourVenues, error: tvErr } = await service.from('tour_venues')
      .select('id, venue_id, tour_id, venue:venues(name, city, state, capacity)')
      .in('tour_id', tourIds)
      .neq('status', 'declined')
      .limit(20);

    if (tvErr) errors.push(`Tour venues query: ${tvErr.message}`);

    for (const tv of (tourVenues || []).filter((tv: any) => !draftedTourVenues.has(tv.id))) {
      try {
        const tour = (tours || []).find((t: any) => t.id === tv.tour_id);
        const act  = (tour as any)?.act;

        // Get primary contact for the venue separately
        const { data: contacts } = await service.from('contacts').select('first_name, last_name, email').eq('venue_id', tv.venue_id).limit(1);
        const contact = contacts?.[0];
        const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'the booking manager' : 'the booking manager';
        const tourDateRange = await getTourDateRange(service, tv.tour_id);

        const message = await client.messages.create({
          model: 'claude-sonnet-4-6', max_tokens: 1024,
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: buildPrompt(act, tv.venue, contactName, agentFrom, tourDateRange) }],
        });
        const text = message.content.find((bl): bl is Anthropic.TextBlock => bl.type === 'text')?.text ?? '';
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) { errors.push(`Claude returned no JSON for tour_venue ${tv.id}`); continue; }
        const draft = JSON.parse(match[0]);

        const { error: insertErr } = await service.from('email_drafts').upsert(
          { booking_id: null, tour_venue_id: tv.id, category: 'target', subject: draft.subject, body: draft.body, agent_id: user.id },
          { onConflict: 'tour_venue_id,category' }
        );
        if (insertErr) { errors.push(`Insert tour_venue draft ${tv.id}: ${insertErr.message}`); continue; }
        created++;
      } catch (e: any) {
        errors.push(`Tour venue ${tv.id}: ${e.message}`);
      }
    }
  }

  return res.status(200).json({
    created,
    errors: errors.length > 0 ? errors : undefined,
    message: created === 0 && errors.length === 0 ? 'All bookings and tour venues already have drafts.' : undefined,
  });
}
