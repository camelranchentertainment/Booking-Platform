// lib/domain/emailReply.ts
//
// Builds a reply to an email the band received: who it goes to, the "Re:"
// subject, and the original quoted underneath, the way any mail app does.
// Also turns the composer's plain text into safe HTML for sending.
// Pure functions, unit-tested in __tests__/lib/domain/emailReply.test.ts.

import { plainText } from './emailPipeline';

/** Longest original kept in the quote. The full thread lives in the band's mailbox. */
export const MAX_QUOTED_CHARS = 3_000;
export const MAX_QUOTED_LINES = 40;

/**
 * The bare address from a From header: `Maxine Lee <maxine@wireroad.beer>` → `maxine@wireroad.beer`.
 *
 * @param from - The From value as stored on the email.
 * @returns The address, lower-cased, or '' when there isn't a plausible one.
 */
export function replyAddress(from: string | null | undefined): string {
  if (!from) return '';
  const angled = from.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  const candidate = (angled ? angled[1] : from).trim().replace(/^mailto:/i, '');
  return /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(candidate) ? candidate.toLowerCase() : '';
}

/**
 * "Re: " + the original subject, without stacking "Re: Re: Re:".
 *
 * @param subject - The original subject.
 * @returns The reply subject.
 */
export function replySubject(subject: string | null | undefined): string {
  const s = (subject ?? '').trim();
  if (!s) return 'Re: your email';
  return /^(re|aw|sv)\s*:/i.test(s) ? s : `Re: ${s}`;
}

/**
 * The reply's starting body: room to type at the top, then the original
 * quoted with "> " under an attribution line. Long originals are cut, since
 * the venue already has the full message.
 *
 * @param original - The received email: who sent it, when, and its body (HTML or text).
 * @param formatWhen - Turns the timestamp into display text (the page's own date format).
 * @returns Plain text for the composer.
 */
export function quotedReplyBody(
  original: { from: string | null | undefined; sentAt: string | null | undefined; body: string | null | undefined },
  formatWhen: (iso: string) => string,
): string {
  // Line breaks and block ends become new lines first; plainText alone would run paragraphs together.
  const withBreaks = (original.body ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n');
  const text = plainText(withBreaks).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  let lines = text.split('\n').map(l => l.trim());
  let cut = false;
  if (lines.length > MAX_QUOTED_LINES) { lines = lines.slice(0, MAX_QUOTED_LINES); cut = true; }
  let quoted = lines.join('\n');
  if (quoted.length > MAX_QUOTED_CHARS) { quoted = quoted.slice(0, MAX_QUOTED_CHARS).replace(/\s+\S*$/, ''); cut = true; }
  const who = (original.from ?? '').trim() || 'they';
  const when = original.sentAt ? `On ${formatWhen(original.sentAt)}, ` : '';
  const body = quoted ? quoted.split('\n').map(l => (l ? `> ${l}` : '>')).join('\n') : '> (no text)';
  return `\n\n${when}${who} wrote:\n${body}${cut ? '\n> …' : ''}`;
}

/**
 * Plain text from the composer → HTML for the email. Escapes the text first, so
 * anything that looks like markup (including a quoted venue email) is shown as
 * text and never sent as live HTML; then keeps line breaks.
 *
 * @param text - What the user typed.
 * @returns Safe HTML.
 */
export function composerTextToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>');
}
