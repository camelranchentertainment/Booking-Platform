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
}): string {
  const headers = [
    `From: ${headerSafe(opts.from)}`,
    `To: ${headerSafe(opts.to)}`,
    `Subject: ${encodeHeaderWord(opts.subject)}`,
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

/**
 * Sends an HTML email from the act's connected Gmail account.
 *
 * @throws Error when inputs are missing or Gmail rejects the message
 */
export async function sendViaGmail(
  actId: string,
  to: string,
  subject: string,
  body: string,
  attachments: ResolvedAttachment[] = [],
): Promise<void> {
  if (!actId || !to || !subject || !body) {
    throw new Error('actId, to, subject, and body are all required');
  }

  const { gmail, gmailAddress } = await getGmailClient(actId);

  const message = buildMimeMessage({
    from: gmailAddress || '',
    to,
    subject,
    html: body,
    attachments,
  });

  const raw = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
}
