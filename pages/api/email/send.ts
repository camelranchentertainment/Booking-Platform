import { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';
import { getServiceClient } from '../../../lib/supabase';
import { updateVenueStatus } from '../../../lib/statusSync';
import type { OutreachStatus } from '../../../lib/types';

async function getResendConfig(service: ReturnType<typeof getServiceClient>) {
  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      from:   process.env.RESEND_FROM_EMAIL || 'booking@mail.camelranchbooking.com',
    };
  }
  const { data } = await service
    .from('platform_settings')
    .select('key, value')
    .in('key', ['resend_api_key', 'resend_from_email']);

  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value;

  return {
    apiKey: map['resend_api_key'] || '',
    from:   map['resend_from_email'] || 'booking@mail.camelranchbooking.com',
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, subject, html, bookingId, tourVenueId, venueId, contactId, actId, templateId, category, bodyPreview } = req.body;
  if (!to || !subject || !html) return res.status(400).json({ error: 'to, subject, html required' });

  const service = getServiceClient();
  const { apiKey, from } = await getResendConfig(service);

  if (!apiKey) {
    return res.status(500).json({ error: 'Email not configured. Add your Resend API key in Settings.' });
  }

  // Authenticate the agent
  let agentId: string | null = null;
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const { data: { user } } = await service.auth.getUser(token);
      agentId = user?.id || null;
    }
  } catch {}

  if (!agentId) return res.status(401).json({ error: 'Unauthorized' });

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({ from, to, subject, html });
    if (error) return res.status(500).json({ error: error.message });

    const now = new Date().toISOString();

    // Step 1 — Log to email_log
    await service.from('email_log').insert({
      sent_by:       agentId,
      booking_id:    bookingId    || null,
      tour_venue_id: tourVenueId  || null,
      venue_id:      venueId      || null,
      contact_id:    contactId    || null,
      act_id:        actId        || null,
      template_id:   templateId   || null,
      category:      category     || null,
      resend_id:     data?.id     || null,
      subject,
      recipient:     to,
      status:        'sent',
      sent_at:       now,
    });

    // Step 2 — Update tour_venues status + timestamps
    if (tourVenueId && category) {
      const isColdPitch = ['target', 'cold_pitch'].includes(category);
      const isFollowUp  = ['follow_up_1', 'follow_up_2', 'follow_up'].includes(category);

      let newTvStatus: OutreachStatus | null = null;
      const tvExtra: Record<string, any> = { last_contacted_at: now };

      if (isColdPitch) {
        newTvStatus = 'pitched';
        tvExtra.pitched_at = now;
      } else if (isFollowUp) {
        newTvStatus = 'followup';
        tvExtra.followup_at = now;
      } else if (category === 'confirmation') {
        newTvStatus = 'confirmed';
      }

      if (newTvStatus) {
        await updateVenueStatus(service, tourVenueId, newTvStatus, agentId, tvExtra);
      } else {
        // Still track contact date even if status doesn't change
        await service.from('tour_venues')
          .update({ last_contacted_at: now, updated_at: now })
          .eq('id', tourVenueId);
      }
    }

    // Step 3 — Update or create booking record
    if (actId && (venueId || bookingId)) {
      const isColdPitch = ['target', 'cold_pitch'].includes(category || '');
      const isFollowUp  = ['follow_up_1', 'follow_up_2', 'follow_up'].includes(category || '');

      if (bookingId) {
        // Update existing booking email tracking
        const bkUpdate: Record<string, any> = {
          email_stage:       category,
          last_contact_date: now,
          updated_at:        now,
        };
        if (category === 'follow_up_1') bkUpdate.follow_up_count = 1;
        if (category === 'follow_up_2') bkUpdate.follow_up_count = 2;
        if (isColdPitch)  { bkUpdate.status = 'pitch';    bkUpdate.pitched_at  = now; }
        if (isFollowUp)   { bkUpdate.status = 'followup'; bkUpdate.followup_at = now; }

        await service.from('bookings').update(bkUpdate).eq('id', bookingId);

        // Log to booking_emails
        await service.from('booking_emails').insert({
          booking_id:        bookingId,
          category,
          sent_at:           now,
          subject,
          body_preview:      bodyPreview ? String(bodyPreview).substring(0, 300) : null,
          resend_message_id: data?.id || null,
          sent_by:           agentId,
        });
      } else if (venueId && isColdPitch) {
        // No booking yet — check if one exists for this venue/act
        const { data: existing } = await service.from('bookings')
          .select('id')
          .eq('act_id', actId)
          .eq('venue_id', venueId)
          .not('status', 'in', '("completed","cancelled")')
          .maybeSingle();

        if (!existing) {
          // Create a pitch-stage booking so the pipeline picks it up
          await service.from('bookings').insert({
            created_by:        agentId,
            act_id:            actId,
            venue_id:          venueId,
            contact_id:        contactId || null,
            status:            'pitch',
            email_stage:       'target',
            last_contact_date: now,
            pitched_at:        now,
            source:            'email_pitch',
            agent_id:          agentId,
          });
        }
      }
    }

    // Step 4 — Fetch venue name for notification
    let venueName = 'the venue';
    let tourId: string | null = null;
    if (venueId) {
      const { data: v } = await service.from('venues').select('name').eq('id', venueId).single();
      if (v?.name) venueName = v.name;
    }
    if (tourVenueId) {
      const { data: tv } = await service.from('tour_venues')
        .select('tour_id, venue:venues(name)')
        .eq('id', tourVenueId).single();
      if (tv) {
        tourId = tv.tour_id || null;
        const tvVenue = tv.venue as any;
        if (tvVenue?.name) venueName = tvVenue.name;
      }
    }

    // Step 5 — Create notification
    const isColdPitch = ['target', 'cold_pitch'].includes(category || '');
    const isFollowUp  = ['follow_up_1', 'follow_up_2', 'follow_up'].includes(category || '');
    const notifMessage = isColdPitch
      ? `Cold pitch sent to ${venueName}`
      : isFollowUp
        ? `Follow-up sent to ${venueName}`
        : `Email sent to ${venueName}`;

    await service.from('notifications').insert({
      user_id:    agentId,
      type:       'email_sent',
      message:    notifMessage,
      action_url: tourId ? `/tours/${tourId}` : tourVenueId ? '/email' : bookingId ? `/bookings/${bookingId}` : '/email',
      related_id: tourVenueId || bookingId || null,
      read:       false,
    });

    return res.status(200).json({ ok: true, id: data?.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
