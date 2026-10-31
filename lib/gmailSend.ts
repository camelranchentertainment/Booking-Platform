// lib/gmailSend.ts
import { randomBytes } from 'crypto';
import { getGmailClient } from './gmailClient';
import type { ResolvedAttachment } from './server/emailAttachments';

/** Removes CR/LF so a value can't inject extra headers (e.g. a hidden Bcc). */
export function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** RFC 2047 encoded-word so non-ASCII subjects and file names survive (é, —, emoji). */
export function encodeHeaderWord(value: string): string {
  const v = headerSafe(value);
  if (/^[ -~]*$/.test(v)) return v;
  return `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`;
}

/** Base64 wrapped at 76 characters per line, as MIME requires. */
function base64Lines(buf: Buffer): string {
  return buf.toString('base64').replace(/.{1,76}/g, line => `${line}\r\n`).trimEnd();
}

/**
 * Builds a raw RFC 5322 message. Without attachments it is a single
 * text/html part (unchanged from before); with attachments it is
 * multipart/mixed: the HTML body first, then one part per file.
 *
 * Exported for tests.
 */
export function buildMimeMessage(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  attachments?: ResolvedAttachment[];
  boundary?: string;
  /** Message-ID of the email being answered, so mail apps file the reply in the same thread. */
  inReplyTo?: string;
  /** The answered email's References chain plus its Message-ID. */
  references?: string;
}): string {
  const headers = [
    `From: ${headerSafe(opts.from)}`,
    `To: ${headerSafe(opts.to)}`,
    `Subject: ${encodeHeaderWord(opts.subject)}`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${headerSafe(opts.inReplyTo)}`] : []),
    ...(opts.references ? [`References: ${headerSafe(opts.references)}`] : []),
    'MIME-Version: 1.0',
  ];

  const attachments = opts.attachments ?? [];
  if (attachments.length === 0) {
    return [...headers, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '',
      base64Lines(Buffer.from(opts.html, 'utf8'))].join('\r\n');
  }

  const boundary = opts.boundary ?? `crb_${randomBytes(12).toString('hex')}`;
  const lines = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(Buffer.from(opts.html, 'utf8')),
  ];

  for (const a of attachments) {
    const name = encodeHeaderWord(a.filename).replace(/"/g, '');
    lines.push(
      `--${boundary}`,
      `Content-Type: ${headerSafe(a.contentType)}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(a.content),
    );
  }
  lines.push(`--${boundary}--`, '');
  return lines.join('\r\n');
}

/** What a reply needs from the email it answers, read from the band's Gmail. */
export interface ReplyThread {
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

type GmailHeader = { name?: string | null; value?: string | null };

/**
 * Threading details from the answered message's headers: its Message-ID becomes
 * In-Reply-To, and is appended to its References chain (RFC 5322 §3.6.4).
 *
 * @param threadId - Gmail's thread id for the answered message.
 * @param headers - That message's headers.
 */
export function replyThreadFromHeaders(threadId: string | null | undefined, headers: GmailHeader[]): ReplyThread {
  const get = (name: string) => headers.find(h => (h.name ?? '').toLowerCase() === name)?.value?.trim() || undefined;
  const messageId = get('message-id');
  const prior = get('references');
  return {
    ...(threadId ? { threadId } : {}),
    ...(messageId ? { inReplyTo: messageId, references: prior ? `${prior} ${messageId}` : messageId } : {}),
  };
}

/**
 * Looks up the email being answered in the band's Gmail so the reply joins its
 * thread. Best effort: if the message is gone or Gmail refuses, the reply still
 * sends, just as a new conversation.
 */
async function lookupReplyThread(
  gmail: Awaited<ReturnType<typeof getGmailClient>>['gmail'],
  gmailMessageId: string,
): Promise<ReplyThread> {
  try {
    const { data } = await gmail.users.messages.get({
      userId: 'me', id: gmailMessageId, format: 'metadata', metadataHeaders: ['Message-ID', 'References'],
    });
    return replyThreadFromHeaders(data.threadId, data.payload?.headers ?? []);
  } catch (err) {
    console.warn('[gmailSend] reply thread lookup failed; sending unthreaded', { message: err instanceof Error ? err.message : String(err) });
    return {};
  }
}

/**
 * Sends an HTML email from the act's connected Gmail account.
 *
 * @param replyToGmailMessageId - Gmail id of a received email this answers; the
 *   reply then lands in the same thread for both sides.
 * @throws Error when inputs are missing or Gmail rejects the message
 */
export async function sendViaGmail(
  actId: string,
  to: string,
  subject: string,
  body: string,
  attachments: ResolvedAttachment[] = [],
  replyToGmailMessageId?: string,
): Promise<void> {
  if (!actId || !to || !subject || !body) {
    throw new Error('actId, to, subject, and body are all required');
  }

  const { gmail, gmailAddress } = await getGmailClient(actId);
  const thread = replyToGmailMessageId ? await lookupReplyThread(gmail, replyToGmailMessageId) : {};

  const message = buildMimeMessage({
    from: gmailAddress || '',
    to,
    subject,
    html: body,
    attachments,
    inReplyTo: thread.inReplyTo,
    references: thread.references,
  });

  const raw = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, ...(thread.threadId ? { threadId: thread.threadId } : {}) },
  });
}
