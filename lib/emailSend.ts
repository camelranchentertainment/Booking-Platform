import { Resend } from 'resend';
import { getServiceClient } from './supabase';
import { sendViaGmail } from './gmailSend';
import { GmailReconnectError, isGmailAuthError } from './gmailAuthError';
import type { ResolvedAttachment } from './server/emailAttachments';
import type { AttachmentRef } from './emailAttachments';
import { findVenueTargets, resolveEmailLinks } from './server/emailLinks';

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
  /** Files to attach, already downloaded and ownership-checked (see resolveAttachments). */
  attachments?: ResolvedAttachment[];
  /** The references those files came from — stored on the email_log row. */
  attachmentRefs?: AttachmentRef[];
  /**
   * Gmail id of the received email this answers (email_log.message_id, already
   * checked to be this band's). Sent through Gmail, the reply joins that thread.
   */
  replyToGmailMessageId?: string;
  /**
   * Post the per-email "Email sent to …" notification (default true). Batch
   * senders turn it off and post one summary instead.
   */
  notify?: boolean;
}): Promise<{ email_log_id: string | null }> {
  const service = getServiceClient();
  const { apiKey, baseFrom } = await getResendConfig(service);

  // Keep only links to this band's own records. A bad id (e.g. one the agent
  // made up) must not fail the log insert after the email has gone out.
  const { links, dropped } = await resolveEmailLinks(service, params.actId, {
    bookingId: params.bookingId,
    venueId: params.venueId,
    tourVenueId: params.tourVenueId,
    contactId: params.contactId,
  });
  if (dropped.length) {
    console.warn('[emailSend] filing email without links that are not this band\'s records', { actId: params.actId, dropped });
  }

  // The tour targets this email counts as contact for. Replies and agent sends
  // carry only the venue, so find its targets on the band's live tours; when
  // there's exactly one, file the email against it too.
  let contactedTargetIds: string[] = links.tourVenueId ? [links.tourVenueId] : [];
  if (!links.tourVenueId && links.venueId) {
    contactedTargetIds = await findVenueTargets(service, params.actId, links.venueId);
    if (contactedTargetIds.length === 1) links.tourVenueId = contactedTargetIds[0];
  }

  const [{ data: act }, { data: creds }] = await Promise.all([
    service.from('acts').select('act_name, contact_email, gmail_address').eq('id', params.actId).single(),
    service.from('act_credentials').select('google_refresh_token').eq('act_id', params.actId).maybeSingle(),
  ]);

  const gmailConnected = Boolean(act?.gmail_address && creds?.google_refresh_token);
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
    try {
      await sendViaGmail(params.actId, params.recipient, params.subject, htmlPayload, params.attachments ?? [], params.replyToGmailMessageId);
    } catch (err) {
      // Expired/revoked connection: say so plainly instead of Google's "invalid_grant".
      if (isGmailAuthError(err)) throw new GmailReconnectError(err);
      throw err;
    }
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
    if (params.attachments?.length) {
      sendPayload.attachments = params.attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      }));
    }
    const { data: resendData, error } = await resend.emails.send(sendPayload);
    if (error) throw new Error(error.message);
    providerMessageId = resendData?.id ?? null;
    const fromMatch = from.match(/<([^>]+)>/);
    actualFromAddress = fromMatch?.[1] || baseFrom || 'bookings@camelranchbooking.com';
  }

  const now = new Date().toISOString();

  const { data: logRow, error: logErr } = await service.from('email_log').insert({
    sent_by: params.sentBy,
    booking_id: links.bookingId,
    tour_venue_id: links.tourVenueId,
    venue_id: links.venueId,
    contact_id: links.contactId,
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
    attachments: params.attachmentRefs ?? [],
  }).select('id').single();
  // The email has already been delivered to the provider. Throwing now would
  // report "Failed" for a sent email and invite a duplicate resend, so record
  // the problem and carry on; the caller gets a null log id.
  const emailLogId: string | null = logRow?.id ?? null;
  if (logErr || !emailLogId) {
    console.error('[emailSend] email SENT but email_log insert failed', {
      actId: params.actId,
      recipient: params.recipient,
      subject: params.subject,
      code: logErr?.code,
      message: logErr?.message,
    });
  }

  for (const tourVenueId of contactedTargetIds) {
    const { error: touchErr } = await service
      .from('tour_venues')
      .update({ last_contacted_at: now, updated_at: now })
      .eq('id', tourVenueId);
    if (touchErr) console.error('[emailSend] could not record last contact', { tourVenueId, code: touchErr.code });
    // The first email to a tour target marks it pitched (the tour card's
    // "Pitched" count reads this). Its outreach status is left to the user.
    const { error: pitchErr } = await service
      .from('tour_venues')
      .update({ pitched_at: now })
      .eq('id', tourVenueId)
      .is('pitched_at', null);
    if (pitchErr) console.error('[emailSend] could not mark target pitched', { tourVenueId, code: pitchErr.code });
  }

  if (links.bookingId) {
    await service
      .from('bookings')
      .update({ last_contact_date: now, updated_at: now })
      .eq('id', links.bookingId)
      .eq('act_id', params.actId);
  }

  if (params.notify === false) return { email_log_id: emailLogId };

  // Resolve venue name + tour id for notification
  let venueName = 'the venue';
  let tourId: string | null = null;

  if (links.venueId) {
    const { data: v } = await service.from('venues').select('name').eq('id', links.venueId).single();
    if (v?.name) venueName = v.name;
  }
  if (links.tourVenueId) {
    const { data: tv } = await service
      .from('tour_venues')
      .select('tour_id, venue:venues(name)')
      .eq('id', links.tourVenueId)
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
      : links.tourVenueId
      ? '/email'
      : links.bookingId
      ? `/bookings/${links.bookingId}`
      : '/email',
    related_id: links.tourVenueId || links.bookingId || null,
    read: false,
  });

  return { email_log_id: emailLogId };
}
