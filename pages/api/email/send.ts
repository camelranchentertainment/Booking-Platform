import { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';
import { getServiceClient } from '../../../lib/supabase';
import { updateVenueStatus } from '../../../lib/statusSync';
import type { OutreachStatus } from '../../../lib/types';

async function getResendConfig(service: ReturnType<typeof getServiceClient>) {
  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      baseFrom: process.env.RESEND_FROM_EMAIL || 'booking@mail.camelranchbooking.com',
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
    baseFrom: map['resend_from_email'] || 'booking@mail.camelranchbooking.com',
  };
}

/** Strip HTML tags for plain-text fallback */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, subject, html, bookingId, tourVenueId, venueId, contactId, actId, templateId, category, bodyPreview } = req.body;
  if (!to || !subject || !html) return res.status(400).json({ error: 'to, subject, html required' });

  const service = getServiceClient();
  const { apiKey, baseFrom } = await getResendConfig(service);

  if (!apiKey) {
    return res.status(500).json({ error: 'Email not configured. Add your Resend API key in Settings.' });
  }

  // Authenticate sender
  let userId: string | null = null;
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const { data: { user } } = await service.auth.getUser(token);
      userId = user?.id || null;
    }
  } catch {}

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // Resolve caller's act and validate the body-supplied actId before any write.
  // Service client bypasses RLS so ownership must be checked explicitly.
  const { data: callerProfile } = await service
    .from('profiles')
    .select('act_id')
    .eq('id', userId)
    .single();
  if (!callerProfile?.act_id) return res.status(403).json({ error: 'Forbidden' });
  if (actId && actId !== callerProfile.act_id) return res.status(403).json({ error: 'Forbidden' });
  const effectiveActId = callerProfile.act_id;

  // ── Dynamic From + Reply-To based on act ──────────────────────────────────
  let from = `Camel Ranch Booking <bookings@camelranchbooking.com>`;
  let replyTo: string | undefined;

  if (effectiveActId) {
    // 1. Get act name + contact_email fallback
    const { data: act } = await service
      .from('acts')
      .select('act_name, contact_email')
      .eq('id', effectiveActId)
      .single();

    if (act?.act_name) {
      from = `${act.act_name} <bookings@camelranchbooking.com>`;
    }

    // 2. Reply-to: prefer band_admin profile email
    const { data: bandAdmin } = await service
      .from('profiles')
      .select('email')
      .eq('act_id', effectiveActId)
      .eq('role', 'band_admin')
      .maybeSingle();

    if (bandAdmin?.email) {
      replyTo = bandAdmin.email;
    } else if (act?.contact_email) {
      // 3. Fall back to act's contact_email
      replyTo = act.contact_email;
    }
    // 4. If neither found, omit replyTo entirely
  }
  // ──────────────────────────────────────────────────────────────────────────

  const resend = new Resend(apiKey);

  try {
    const sendPayload: Parameters<typeof resend.emails.send>[0] = { from, to, subject, html };
    if (replyTo) sendPayload.replyTo = replyTo;
    const { data, error } = await resend.emails.send(sendPayload);
    if (error) return res.status(500).json({ error: error.message });

    const now = new Date().toISOString();

    // Step 1 — Log to email_log
    await service.from('email_log').insert({
      sent_by:       userId,
      booking_id:    bookingId      || null,
      tour_venue_id: tourVenueId    || null,
      venue_id:      venueId        || null,
      contact_id:    contactId      || null,
      act_id:        effectiveActId || null,
      template_id:   templateId     || null,
      category:      category       || null,
      resend_id:     data?.id       || null,
      subject,
      body:          bodyPreview  || null,
      recipient:     to,
      status:        'sent',
      sent_at:       now,
      direction:     'sent',
    });

    // Step 2 — Update tour_venues status + timestamps
    if (tourVenueId && category) {
      // Verify tourVenueId belongs to caller's act before mutating.
      const { data: tvLookup } = await service.from('tour_venues')
        .select('tour_id').eq('id', tourVenueId).single();
      if (!tvLookup) return res.status(403).json({ error: 'Forbidden' });
      const { data: tourCheck } = await service.from('tours')
        .select('id').eq('id', tvLookup.tour_id).eq('act_id', effectiveActId).single();
      if (!tourCheck) return res.status(403).json({ error: 'Forbidden' });

      const isColdPitch = ['target', 'cold_pitch'].includes(category);
      const isFollowUp  = ['follow_up_1', 'follow_up_2', 'follow_up'].includes(category);

      let newTvStatus: OutreachStatus | null = null;
      const tvExtra: Record<string, any> = { last_contacted_at: now };

      if (isColdPitch) {
        newTvStatus = 'pitched';
        tvExtra.pitched_at = now;
      } else if (isFollowUp) {
        newTvStatus = 'waiting';
        tvExtra.responded_at = now;
      } else if (category === 'confirmation') {
        newTvStatus = 'confirmed';
      }

      if (newTvStatus) {
        try {
          await updateVenueStatus(service, tourVenueId, newTvStatus, userId, tvExtra);
        } catch (e: any) {
          console.error('[email/send] tour_venues status update FAILED', { tourVenueId, newTvStatus, category, error: e?.message });
        }
      } else {
        await service.from('tour_venues')
          .update({ last_contacted_at: now, updated_at: now })
          .eq('id', tourVenueId);
      }
    }

    // Step 3 — Update or create booking record
    if (effectiveActId && (venueId || bookingId)) {
      const isColdPitch = ['target', 'cold_pitch'].includes(category || '');
      const isFollowUp  = ['follow_up_1', 'follow_up_2', 'follow_up'].includes(category || '');

      if (bookingId) {
        const bkUpdate: Record<string, any> = {
          email_stage:       category,
          last_contact_date: now,
          updated_at:        now,
        };
        if (category === 'follow_up_1') bkUpdate.follow_up_count = 1;
        if (category === 'follow_up_2') bkUpdate.follow_up_count = 2;
        if (isColdPitch)  { bkUpdate.status = 'pitch';    bkUpdate.pitched_at   = now; }
        if (isFollowUp)   { bkUpdate.status = 'pitch';    bkUpdate.responded_at = now; }
        await service.from('bookings').update(bkUpdate)
          .eq('id', bookingId)
          .eq('act_id', effectiveActId);
      } else if (venueId && isColdPitch) {
        const { data: existing } = await service.from('bookings')
          .select('id')
          .eq('act_id', effectiveActId)
          .eq('venue_id', venueId)
          .not('status', 'in', '("completed","cancelled")')
          .maybeSingle();

        if (!existing) {
          await service.from('bookings').insert({
            created_by:        userId,
            act_id:            effectiveActId,
            venue_id:          venueId,
            contact_id:        contactId || null,
            status:            'pitch',
            email_stage:       'target',
            last_contact_date: now,
            pitched_at:        now,
            source:            'email_pitch',
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
      user_id:    userId,
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
