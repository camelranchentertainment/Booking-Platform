// pages/api/booker/offers/[id]/send.ts
// POST — emails the offer or deal memo as a PDF from the agent's own Gmail,
// logs the email, and marks the offer sent.
//
// Body (OfferSendSchema): to_email, to_name?, subject, body
//
//   200 { offer, warning? }   sent (warning when only a record failed)
//   400 invalid body / offer already answered
//   401/403 not an agent · 404 not the caller's offer
//   409 Gmail not connected
//   429 send limit reached
//   502 Gmail rejected the send (a failed row is logged; the offer stays as it was)
//
// Service role: bypasses RLS, so the caller is resolved with requireBooker and
// every read and write is scoped to that bookerId. This route is the only
// writer of an offer's sent_at / sent_to / message_id (the browser has no
// grant on those columns), so "sent" always means Gmail accepted it.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../../lib/supabase';
import { AppError, withHandler } from '../../../../../lib/apiError';
import { requireBooker } from '../../../../../lib/server/requireBooker';
import { OfferSendSchema } from '../../../../../lib/booker/schemas';
import { bodyToHtml } from '../../../../../lib/booker/emailFormat';
import { offerFilename } from '../../../../../lib/booker/offers';
import { assertWithinSendLimit, resolveLinks } from '../../../../../lib/server/bookerMessages';
import { getBookerGmail, sendViaBookerGmail } from '../../../../../lib/server/bookerGmail';
import { loadOfferAgency, loadOwnedOffer, offerIdFrom } from '../../../../../lib/server/bookerOffers';
import { renderOfferPdf } from '../../../../../lib/server/offerPdf';

/** Sends one of the caller's offers and records the send. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    throw new AppError(405, 'Method not allowed');
  }
  const offerId = offerIdFrom(req.query.id);
  const parsed = OfferSendSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the email and try again');
  const input = parsed.data;

  const service = getServiceClient();
  const { bookerId } = await requireBooker(req, service);
  const offer = await loadOwnedOffer(service, bookerId, offerId);
  if (offer.status !== 'draft' && offer.status !== 'sent') {
    throw new AppError(400, `This ${offer.kind === 'deal_memo' ? 'deal memo' : 'offer'} was already ${offer.status}. Make a new one to send different terms.`);
  }

  const gmail = await getBookerGmail(service, bookerId);
  if (!gmail) throw new AppError(409, 'Connect your Gmail in Settings to send offers from the workspace.');
  const links = await resolveLinks(service, bookerId, { roster_id: null, venue_id: null, contact_id: null, show_id: offer.show_id });
  await assertWithinSendLimit(service, bookerId);

  const agency = await loadOfferAgency(service, bookerId);
  const pdf = Buffer.from(await renderOfferPdf(offer, agency));
  const filename = offerFilename(offer);

  const base = {
    booker_id: bookerId,
    ...links,
    direction: 'outbound' as const,
    to_email: input.to_email,
    to_name: input.to_name,
    copy_to_self: false,
    subject: input.subject,
    body: `${input.body}\n\n[Attached: ${filename}]`,
    reply_to: gmail.gmail_address,
    sent_via: 'gmail' as const,
    template_key: null,
    ai_assisted: false,
  };

  let delivery;
  try {
    delivery = await sendViaBookerGmail(service, gmail, {
      displayName: agency.agencyName,
      to: input.to_email,
      subject: input.subject,
      html: bodyToHtml(input.body),
      attachments: [{ filename, contentType: 'application/pdf', content: pdf }],
    });
  } catch (err) {
    const message = err instanceof AppError && err.isOperational ? err.message : 'The email could not be sent.';
    const { error: logErr } = await service.from('booker_messages').insert({ ...base, from_address: gmail.gmail_address, status: 'failed', error: message.slice(0, 500) });
    if (logErr) console.error('[booker/offers/send] could not log failed send', { code: logErr.code });
    throw err;
  }

  const sentAt = new Date().toISOString();
  const { data: message, error: msgErr } = await service
    .from('booker_messages')
    .insert({ ...base, from_address: delivery.fromAddress, provider_message_id: delivery.providerMessageId, status: 'sent', sent_at: sentAt })
    .select('id')
    .single();
  if (msgErr) console.error('[booker/offers/send] sent but not logged', { code: msgErr.code });

  const { data: updated, error: offErr } = await service
    .from('booker_offers')
    .update({ status: 'sent', sent_at: sentAt, sent_to: input.to_email, message_id: message?.id ?? null })
    .eq('id', offer.id)
    .eq('booker_id', bookerId)
    .select('*')
    .single();
  if (offErr || !updated) {
    // The email went out; only the record failed. Say so rather than inviting a duplicate send.
    console.error('[booker/offers/send] sent but offer not updated', { code: offErr?.code });
    return res.status(200).json({ offer: null, warning: 'Your offer was emailed, but the workspace could not mark it sent. Refresh before sending again.' });
  }
  res.status(200).json({ offer: updated, warning: msgErr ? 'Sent, but it could not be saved to the email history.' : undefined });
}

export default withHandler(handler);
