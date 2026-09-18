import { Resend } from 'resend';
import { getServiceClient } from './supabase';
import { sendViaGmail } from './gmailSend';

export function stripHtml(html: string): string {
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

function plainToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

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

export async function sendActEmail(params: {
  actId: string;
  sentBy: string;
  recipient: string;
  subject: string;
  /** Plain-text body — stored in email_log and used to generate HTML if bodyHtml is not provided. */
  body: string;
  /** HTML payload for Resend/Gmail. If omitted, body is auto-converted to paragraph HTML. */
  bodyHtml?: string;
  bookingId?: string;
  venueId?: string;
  tourVenueId?: string;
  contactId?: string;
  templateId?: string;
  category?: string;
}): Promise<{ email_log_id: string }> {
  const service = getServiceClient();
  const { apiKey, baseFrom } = await getResendConfig(service);

  const { data: act } = await service
    .from('acts')
    .select('act_name, contact_email, gmail_address, google_refresh_token')
    .eq('id', params.actId)
    .single();

  const gmailConnected = Boolean(act?.gmail_address && act?.google_refresh_token);
  const gmailAddress: string | null = act?.gmail_address || null;

  let from = `Camel Ranch Booking <bookings@camelranchbooking.com>`;
  if (act?.act_name) from = `${act.act_name} <bookings@camelranchbooking.com>`;

  let replyTo: string | undefined;
  const { data: bandAdmin } = await service
    .from('profiles')
    .select('email')
    .eq('act_id', params.actId)
    .eq('role', 'band_admin')
    .maybeSingle();
  if (bandAdmin?.email) {
    replyTo = bandAdmin.email;
  } else if (act?.contact_email) {
    replyTo = act.contact_email;
  }

  const htmlPayload = params.bodyHtml ?? plainToHtml(params.body);

  let providerMessageId: string | null = null;
  let actualFromAddress: string | null = null;

  if (gmailConnected) {
    await sendViaGmail(params.actId, params.recipient, params.subject, htmlPayload);
    actualFromAddress = gmailAddress;
  } else {
    if (!apiKey) {
      throw new Error('Email not configured. Connect Gmail or add a Resend API key in Settings.');
    }
    const resend = new Resend(apiKey);
    const sendPayload: Parameters<typeof resend.emails.send>[0] = {
      from,
      to: params.recipient,
      subject: params.subject,
      html: htmlPayload,
    };
    if (replyTo) sendPayload.replyTo = replyTo;
    const { data: resendData, error } = await resend.emails.send(sendPayload);
    if (error) throw new Error(error.message);
    providerMessageId = resendData?.id ?? null;
    const fromMatch = from.match(/<([^>]+)>/);
    actualFromAddress = fromMatch?.[1] || baseFrom || 'bookings@camelranchbooking.com';
  }

  const now = new Date().toISOString();

  const { data: logRow, error: logErr } = await service.from('email_log').insert({
    sent_by: params.sentBy,
    booking_id: params.bookingId || null,
    tour_venue_id: params.tourVenueId || null,
    venue_id: params.venueId || null,
    contact_id: params.contactId || null,
    act_id: params.actId,
    template_id: params.templateId || null,
    category: params.category || null,
    resend_id: providerMessageId,
    subject: params.subject,
    body: params.body,
    recipient: params.recipient,
    from_address: actualFromAddress,
    status: 'sent',
    sent_at: now,
    direction: 'sent',
    is_draft: false,
  }).select('id').single();
  if (logErr) throw new Error(`email_log insert failed: ${logErr.message}`);

  if (params.tourVenueId) {
    await service
      .from('tour_venues')
      .update({ last_contacted_at: now, updated_at: now })
      .eq('id', params.tourVenueId);
  }

  if (params.bookingId) {
    await service
      .from('bookings')
      .update({ last_contact_date: now, updated_at: now })
      .eq('id', params.bookingId)
      .eq('act_id', params.actId);
  }

  // Resolve venue name + tour id for notification
  let venueName = 'the venue';
  let tourId: string | null = null;

  if (params.venueId) {
    const { data: v } = await service.from('venues').select('name').eq('id', params.venueId).single();
    if (v?.name) venueName = v.name;
  }
  if (params.tourVenueId) {
    const { data: tv } = await service
      .from('tour_venues')
      .select('tour_id, venue:venues(name)')
      .eq('id', params.tourVenueId)
      .single();
    if (tv) {
      tourId = tv.tour_id || null;
      const tvVenue = tv.venue as any;
      if (tvVenue?.name) venueName = tvVenue.name;
    }
  }

  await service.from('notifications').insert({
    user_id: params.sentBy,
    type: 'email_sent',
    message: `Email sent to ${venueName}`,
    action_url: tourId
      ? `/tours/${tourId}`
      : params.tourVenueId
      ? '/email'
      : params.bookingId
      ? `/bookings/${params.bookingId}`
      : '/email',
    related_id: params.tourVenueId || params.bookingId || null,
    read: false,
  });

  return { email_log_id: logRow.id };
}
