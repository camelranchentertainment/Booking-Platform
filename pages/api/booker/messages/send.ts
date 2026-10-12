// pages/api/booker/messages/send.ts
// POST — sends one email from the Booking Agent workspace and logs it.
//
// Body (MessageSendSchema): to_email, to_name?, subject, body, roster_id?,
// venue_id?, contact_id?, show_id?, followup_on?, template_key?, ai_assisted?
//
//   200 { message }            sent and logged
//   400 invalid body / reference not the caller's
//   401/403 not an agent
//   409 Gmail not connected (or the connection expired)
//   429 send limit reached
//   502 Gmail rejected the send (a failed row is logged)
//
// Delivery: always the agent's own connected Gmail, the same model as the
// band side. There is no platform sender for agents: the email comes from
// their address, replies land in their inbox and Gmail keeps the copy in Sent.
//
// Service role: bypasses RLS, so the caller is resolved with requireBooker and
// every read and write is scoped to that bookerId. The browser has no INSERT
// grant on booker_messages; this route is the only writer.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../lib/supabase';
import { AppError, withHandler } from '../../../../lib/apiError';
import { requireBooker } from '../../../../lib/server/requireBooker';
import { MessageSendSchema } from '../../../../lib/booker/schemas';
import { bodyToHtml } from '../../../../lib/booker/emailFormat';
import { assertWithinSendLimit, loadAgencyName, resolveLinks } from '../../../../lib/server/bookerMessages';
import { getBookerGmail, sendViaBookerGmail } from '../../../../lib/server/bookerGmail';

/** Sends an agent's email and records it in booker_messages. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    throw new AppError(405, 'Method not allowed');
  }
  const service = getServiceClient();
  const { bookerId } = await requireBooker(req, service);

  const parsed = MessageSendSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the email and try again');
  const input = parsed.data;

  const gmail = await getBookerGmail(service, bookerId);
  if (!gmail) throw new AppError(409, 'Connect your Gmail in Settings to send email from the workspace.');
  const links = await resolveLinks(service, bookerId, input);
  await assertWithinSendLimit(service, bookerId);
  const agencyName = await loadAgencyName(service, bookerId);

  const base = {
    booker_id: bookerId,
    ...links,
    direction: 'outbound' as const,
    to_email: input.to_email,
    to_name: input.to_name,
    // Gmail keeps the agent's copy in Sent; no separate copy is sent.
    copy_to_self: false,
    subject: input.subject,
    body: input.body,
    reply_to: gmail.gmail_address,
    sent_via: 'gmail' as const,
    followup_on: input.followup_on,
    template_key: input.template_key,
    ai_assisted: input.ai_assisted,
  };

  let delivery;
  try {
    delivery = await sendViaBookerGmail(service, gmail, { displayName: agencyName, to: input.to_email, subject: input.subject, html: bodyToHtml(input.body) });
  } catch (err) {
    const message = err instanceof AppError && err.isOperational ? err.message : 'The email could not be sent.';
    // Record the attempt so the agent sees it failed (and it counts toward the limit).
    const { error: logErr } = await service.from('booker_messages').insert({ ...base, from_address: gmail.gmail_address, status: 'failed', error: message.slice(0, 500), followup_on: null });
    if (logErr) console.error('[booker/messages/send] could not log failed send', { code: logErr.code });
    throw err;
  }

  const { data: message, error } = await service
    .from('booker_messages')
    .insert({ ...base, from_address: delivery.fromAddress, provider_message_id: delivery.providerMessageId, status: 'sent', sent_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error || !message) {
    // The email went out; only the history row failed. Say so rather than inviting a duplicate send.
    console.error('[booker/messages/send] sent but not logged', { code: error?.code });
    return res.status(200).json({ message: null, warning: 'Your email was sent, but it could not be saved to the history.' });
  }
  res.status(200).json({ message });
}

export default withHandler(handler);
