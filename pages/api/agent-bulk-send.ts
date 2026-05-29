import { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '../../lib/supabase';
import { getSetting } from '../../lib/platformSettings';

interface VenueTarget {
  tourVenueId: string;
  venueId: string;
  name: string;
  city?: string;
  state?: string;
  email?: string | null;
  contactName?: string | null;
}

function personalize(template: string, venueName: string, contactName: string): string {
  return template
    .replace(/\{venue_name\}/gi, venueName)
    .replace(/\{contact_name\}/gi, contactName || 'Booking Manager');
}

function toHtml(text: string): string {
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:560px">${
    text.split('\n\n').map(p => `<p style="margin:0 0 1em">${p.replace(/\n/g, '<br>')}</p>`).join('')
  }</div>`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const anonClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { venues, subject, body, actId, tourId, addToTour } = req.body as {
    venues: VenueTarget[];
    subject: string;
    body: string;
    actId: string;
    tourId?: string;
    addToTour?: boolean; // for city_search flow — add venues to tour first
  };

  if (!venues?.length) return res.status(400).json({ error: 'venues required' });
  if (!subject || !body) return res.status(400).json({ error: 'subject and body required' });

  const service = getServiceClient();

  // Get Resend config
  const [resendKey, fromEmail] = await Promise.all([
    getSetting('resend_api_key'),
    getSetting('resend_from_email'),
  ]);
  if (!resendKey) return res.status(500).json({ error: 'Email not configured. Add your Resend API key in Settings.' });

  const resend = new Resend(resendKey);
  const from = fromEmail || 'booking@mail.camelranchbooking.com';
  const now = new Date().toISOString();

  const results: { venue: string; status: 'sent' | 'no_email' | 'error'; error?: string }[] = [];

  for (const v of venues) {
    if (!v.email) {
      results.push({ venue: v.name, status: 'no_email' });
      continue;
    }

    const personalizedBody = personalize(body, v.name, v.contactName || '');
    const personalizedSubject = personalize(subject, v.name, v.contactName || '');

    try {
      // If city_search flow, insert tour_venue first
      let tourVenueId = v.tourVenueId;
      if (addToTour && tourId && !tourVenueId) {
        const { data: tv } = await service.from('tour_venues').insert({
          tour_id:  tourId,
          venue_id: v.venueId,
          status:   'target',
          added_by: user.id,
        }).select('id').single();
        tourVenueId = tv?.id;
      }

      // Send email
      const { error: sendErr } = await resend.emails.send({
        from,
        to: v.email,
        subject: personalizedSubject,
        html: toHtml(personalizedBody),
        text: personalizedBody,
        replyTo: 'replies@dorurinaah.resend.app',
      });

      if (sendErr) throw new Error(sendErr.message);

      // Log to email_log
      await service.from('email_log').insert({
        sent_by:       user.id,
        tour_venue_id: tourVenueId   || null,
        venue_id:      v.venueId,
        act_id:        actId,
        category:      'target',
        subject:       personalizedSubject,
        recipient:     v.email,
        status:        'sent',
        sent_at:       now,
      });

      // Update tour_venue status to 'reached_out'
      if (tourVenueId) {
        await service.from('tour_venues').update({
          status:            'reached_out',
          pitched_at:        now,
          last_contacted_at: now,
          updated_at:        now,
        }).eq('id', tourVenueId);
      }

      results.push({ venue: v.name, status: 'sent' });
    } catch (err: any) {
      results.push({ venue: v.name, status: 'error', error: err.message });
    }
  }

  const sent  = results.filter(r => r.status === 'sent').length;
  const noEmail = results.filter(r => r.status === 'no_email').length;
  const errors = results.filter(r => r.status === 'error').length;

  // Create a summary notification
  await service.from('notifications').insert({
    user_id:    user.id,
    type:       'bulk_send',
    message:    `Bulk outreach complete: ${sent} sent${noEmail ? `, ${noEmail} skipped (no email)` : ''}${errors ? `, ${errors} failed` : ''}`,
    action_url: tourId ? `/tours/${tourId}` : '/email',
    related_id: tourId || null,
    read:       false,
  }).then(() => {});

  return res.status(200).json({ sent, noEmail, errors, results });
}
