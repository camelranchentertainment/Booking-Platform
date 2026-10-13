// pages/api/agent-bulk-send.ts
// POST — sends one personalised outreach email per venue for the Booking
// Agent ("blast the Lone Star targets", or a city search with "add to tour").
//
// Every email goes through sendActEmail, the same path as a single send, so it
// leaves from the band's connected Gmail when there is one (Resend otherwise),
// replies come back to the band, the body is stored, and the tour target is
// marked contacted and pitched. This route used to call Resend directly, so
// pitches never appeared in the band's Gmail and never counted as pitched.
//
//   200 { sent, noEmail, errors, results }
//   400 invalid body, 401 not signed in, 403 not a band admin or not the
//   caller's band/tour/venues, 500 email not configured

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '../../lib/supabase';
import { isBandAdminRole } from '../../lib/server/requireBandAdmin';
import { sendActEmail } from '../../lib/emailSend';

const MAX_VENUES_PER_SEND = 100;

const VenueSchema = z.object({
  tourVenueId: z.string().uuid().nullish(),
  venueId: z.string().uuid().nullish(),
  name: z.string().trim().min(1).max(200),
  city: z.string().nullish(),
  state: z.string().nullish(),
  email: z.string().trim().max(254).nullish(),
  contactName: z.string().trim().max(200).nullish(),
});

const BodySchema = z.object({
  venues: z.array(VenueSchema).min(1, 'venues required').max(MAX_VENUES_PER_SEND, `At most ${MAX_VENUES_PER_SEND} venues per send`),
  subject: z.string().trim().min(1, 'subject and body required').max(300),
  body: z.string().trim().min(1, 'subject and body required').max(20_000),
  actId: z.string().uuid(),
  tourId: z.string().uuid().nullish(),
  /** City-search flow: add each venue to the tour before sending. */
  addToTour: z.boolean().optional(),
});

type SendResult = { venue: string; status: 'sent' | 'no_email' | 'error'; error?: string };

/** Fills {venue_name} / {contact_name} placeholders. */
function personalize(template: string, venueName: string, contactName: string): string {
  return template
    .replace(/\{venue_name\}/gi, venueName)
    .replace(/\{contact_name\}/gi, contactName || 'Booking Manager');
}

/** Plain text → minimal HTML paragraphs, escaping anything that looks like markup. */
function toHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:560px">${text
    .split('\n\n')
    .map(p => `<p style="margin:0 0 1em">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')}</div>`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sends the batch for a band admin; ids are checked against the caller's band before anything is sent. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const anonClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const {
    data: { user },
    error: authErr,
  } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();

  // The band always comes from the caller's profile; a body actId must match it.
  const { data: callerProfile } = await service.from('profiles').select('act_id, role').eq('id', user.id).single();
  if (!callerProfile?.act_id) return res.status(403).json({ error: 'Forbidden' });
  // Sends real email as the band — admins only.
  if (!isBandAdminRole(callerProfile.role)) return res.status(403).json({ error: 'Forbidden' });
  const actId = String(callerProfile.act_id);

  const parsed = BodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
  const { venues, subject, body, tourId, addToTour } = parsed.data;
  if (parsed.data.actId !== actId) return res.status(403).json({ error: 'Forbidden' });

  if (tourId) {
    const { data: tourCheck } = await service.from('tours').select('id').eq('id', tourId).eq('act_id', actId).maybeSingle();
    if (!tourCheck) return res.status(403).json({ error: 'Forbidden' });
  }

  // Every tour target must be on the validated tour (or, with no tourId, on one
  // of this band's tours). Its venue comes from the database, not the request.
  const tvIds = venues.map(v => v.tourVenueId).filter((id): id is string => !!id);
  const venueForTarget = new Map<string, string | null>();
  if (tvIds.length > 0) {
    const { data: tvRows } = await service.from('tour_venues').select('id, tour_id, venue_id').in('id', tvIds);
    if (!tvRows || tvRows.length !== new Set(tvIds).size) return res.status(403).json({ error: 'Forbidden' });
    if (tourId) {
      if (!tvRows.every(tv => tv.tour_id === tourId)) return res.status(403).json({ error: 'Forbidden' });
    } else {
      const tourIds = [...new Set(tvRows.map(tv => tv.tour_id).filter(Boolean))] as string[];
      if (tourIds.length > 0) {
        const { data: tourRows } = await service.from('tours').select('id').in('id', tourIds).eq('act_id', actId);
        if (!tourRows || tourRows.length !== tourIds.length) return res.status(403).json({ error: 'Forbidden' });
      }
    }
    for (const tv of tvRows) venueForTarget.set(String(tv.id), tv.venue_id ? String(tv.venue_id) : null);
  }

  // Venues named directly (city-search flow) must belong to this band.
  const directVenueIds = [...new Set(venues.filter(v => !v.tourVenueId && v.venueId).map(v => v.venueId as string))];
  if (directVenueIds.length > 0) {
    const { data: owned } = await service.from('venues').select('id').in('id', directVenueIds).eq('act_id', actId);
    if (!owned || owned.length !== directVenueIds.length) return res.status(403).json({ error: 'Forbidden' });
  }

  const results: SendResult[] = [];
  for (const v of venues) {
    const email = v.email?.trim();
    if (!email || !EMAIL_RE.test(email)) {
      results.push({ venue: v.name, status: 'no_email' });
      continue;
    }

    try {
      const venueId = v.tourVenueId ? venueForTarget.get(v.tourVenueId) ?? null : v.venueId ?? null;

      // City-search flow: put the venue on the tour first, so the email is
      // logged against the target and marks it pitched.
      let tourVenueId = v.tourVenueId ?? null;
      if (addToTour && tourId && !tourVenueId && venueId) {
        const { data: tv, error: tvErr } = await service
          .from('tour_venues')
          .insert({ tour_id: tourId, venue_id: venueId, status: 'target', added_by: user.id })
          .select('id')
          .single();
        if (tvErr) console.error('[agent-bulk-send] could not add venue to tour', { venueId, code: tvErr.code });
        tourVenueId = tv?.id ?? null;
      }

      const text = personalize(body, v.name, v.contactName ?? '');
      await sendActEmail({
        actId,
        sentBy: user.id,
        recipient: email,
        subject: personalize(subject, v.name, v.contactName ?? ''),
        body: text,
        bodyHtml: toHtml(text),
        venueId: venueId ?? undefined,
        tourVenueId: tourVenueId ?? undefined,
        category: 'target',
        notify: false,
      });
      results.push({ venue: v.name, status: 'sent' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed';
      console.error('[agent-bulk-send] send failed', { venue: v.name, message });
      results.push({ venue: v.name, status: 'error', error: message });
      // Not configured at all: every remaining send would fail the same way.
      if (/not configured/i.test(message)) break;
    }
  }

  const sent = results.filter(r => r.status === 'sent').length;
  const noEmail = results.filter(r => r.status === 'no_email').length;
  const errors = results.filter(r => r.status === 'error').length;

  if (sent === 0 && errors > 0 && /not configured/i.test(results.find(r => r.status === 'error')?.error ?? '')) {
    return res.status(500).json({ error: results.find(r => r.status === 'error')?.error });
  }

  const { error: notifyErr } = await service.from('notifications').insert({
    user_id: user.id,
    type: 'bulk_send',
    message: `Bulk outreach complete: ${sent} sent${noEmail ? `, ${noEmail} skipped (no email)` : ''}${errors ? `, ${errors} failed` : ''}`,
    action_url: tourId ? `/tours/${tourId}` : '/email',
    related_id: tourId || null,
    read: false,
  });
  if (notifyErr) console.error('[agent-bulk-send] summary notification failed', { code: notifyErr.code });

  return res.status(200).json({ sent, noEmail, errors, results });
}
