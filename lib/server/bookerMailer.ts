// lib/server/bookerMailer.ts
// Delivers one email for the Booking Agent workspace through the platform's
// Resend account. Server-only. Kept separate from the band-side sender
// (lib/emailSend.ts) because it never touches act data or act credentials.
//
// Gmail delivery (the agent's own mailbox) is added in a later phase; until
// then every message goes out from the platform address with Reply-To set to
// the agent, so replies land in the agent's own inbox whatever provider they use.

import { Resend } from 'resend';
import { getResendConfig } from '../emailSend';
import { getServiceClient } from '../supabase';
import { AppError } from '../apiError';

export interface OutgoingEmail {
  /** Full From header, already sanitised, e.g. `Lone Star Booking <booking@…>` */
  from: string;
  to: string;
  replyTo: string;
  /** Blind copy to the agent when they ask for a copy */
  bcc?: string;
  subject: string;
  html: string;
  text: string;
}

export interface DeliveryResult {
  providerMessageId: string | null;
  fromAddress: string;
}

/** The platform sender address, e.g. booking@camelranchbooking.com. */
export async function platformFromAddress(): Promise<string> {
  const { baseFrom } = await getResendConfig(getServiceClient());
  return baseFrom;
}

/**
 * Sends through Resend.
 *
 * @throws AppError 501 when no Resend key is configured
 * @throws AppError 502 when Resend rejects the message (message is safe to show)
 */
export async function deliverViaPlatform(email: OutgoingEmail): Promise<DeliveryResult> {
  const { apiKey, baseFrom } = await getResendConfig(getServiceClient());
  if (!apiKey) {
    throw new AppError(501, 'Email sending is not set up yet. Ask the platform admin to add the Resend key.');
  }
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: email.from,
    to: email.to,
    replyTo: email.replyTo,
    ...(email.bcc ? { bcc: email.bcc } : {}),
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (error) {
    // Provider text is logged, not shown: it can include internal detail.
    console.error('[bookerMailer] Resend rejected the message', { name: error.name, message: error.message });
    throw new AppError(502, 'The email could not be sent. Check the address and try again in a minute.');
  }
  const address = email.from.match(/<([^>]+)>/)?.[1] ?? baseFrom;
  return { providerMessageId: data?.id ?? null, fromAddress: address };
}
