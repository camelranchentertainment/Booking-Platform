// pages/api/booker/messages/send.ts
// POST — sends one email from the Booking Agent workspace and logs it.
//
// Body (MessageSendSchema): to_email, to_name?, subject, body, roster_id?,
// venue_id?, contact_id?, show_id?, followup_on?, copy_to_self?
//
//   200 { message }            sent and logged
//   400 invalid body / reference not the caller's / no reply address
//   401/403 not an agent
//   429 send limit reached
//   501 email not configured, 502 provider rejected (a failed row is logged)
//
// Service role: bypasses RLS, so the caller is resolved with requireBooker and
// every read and write is scoped to that bookerId. The browser has no INSERT
// grant on booker_messages; this route is the only writer.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../lib/supabase';
import { AppError, withHandler } from '../../../../lib/apiError';
import { requireBooker } from '../../../../lib/server/requireBooker';
import { MessageSendSchema } from '../../../../lib/booker/schemas';
import { bodyToHtml, fromHeader } from '../../../../lib/booker/emailFormat';
import { assertWithinSendLimit, loadSenderIdentity, resolveLinks } from '../../../../lib/server/bookerMessages';
import { deliverViaPlatform, platformFromAddress } from '../../../../lib/server/bookerMailer';

/** Sends an agent's email and records it in booker_messages. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    throw new AppError(405, 'Method not allowed');
  }
  const service = getServiceClient();
  const { bookerId, userId } = await requireBooker(req, service);

  const parsed = MessageSendSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the email and try again');
  const input = parsed.data;

  const links = await resolveLinks(service, bookerId, input);
  await assertWithinSendLimit(service, bookerId);
  const sender = await loadSenderIdentity(service, bookerId, userId);
  const fromAddress = await platformFromAddress();

  const base = {
    booker_id: bookerId,
    ...links,
    direction: 'outbound' as const,
    to_email: input.to_email,
    to_name: input.to_name,
    copy_to_self: input.copy_to_self,
    subject: input.subject,
    body: input.body,
    reply_to: sender.replyTo,
    sent_via: 'platform' as const,
    followup_on: input.followup_on,
    template_key: input.template_key,
    ai_assisted: input.ai_assisted,
  };

  let delivery;
  try {
    delivery = await deliverViaPlatform({
      from: fromHeader(sender.agencyName, fromAddress),
      to: input.to_email,
      replyTo: sender.replyTo,
      bcc: input.copy_to_self && sender.replyTo.toLowerCase() !== input.to_email.toLowerCase() ? sender.replyTo : undefined,
      subject: input.subject,
      html: bodyToHtml(input.body),
      text: input.body,
    });
  } catch (err) {
    const message = err instanceof AppError && err.isOperational ? err.message : 'The email could not be sent.';
    // Record the attempt so the agent sees it failed (and it counts toward the limit).
    const { error: logErr } = await service.from('booker_messages').insert({ ...base, from_address: fromAddress, status: 'failed', error: message.slice(0, 500), followup_on: null });
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
