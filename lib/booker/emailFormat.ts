// lib/booker/emailFormat.ts
// Pure helpers for email the agent sends from the workspace. Shared by the
// compose dialog (preview, defaults) and the send route (HTML, headers).

import { addDays } from './dates';

/** Days after sending that the follow-up reminder defaults to. */
export const DEFAULT_FOLLOWUP_DAYS = 7;

/** Escapes text for safe inclusion in HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Plain-text message → minimal HTML email body. Blank lines start paragraphs,
 * single newlines become <br>. Everything the agent typed is escaped, so a
 * pasted "<script>" arrives as text, never markup.
 */
export function bodyToHtml(body: string): string {
  const paragraphs = body
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 1em">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f">${paragraphs.join('')}</div>`;
}

/**
 * A display name safe for a From header: no quotes, angle brackets, commas,
 * semicolons or line breaks (header injection / address parsing), trimmed and
 * capped. Falls back when nothing usable is left.
 */
export function safeDisplayName(name: string | null | undefined, fallback = 'Booking Agent'): string {
  const cleaned = (name ?? '')
    .replace(/[\r\n"<>,;\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

/** `Name <address>` with a sanitised name. */
export function fromHeader(displayName: string | null | undefined, address: string): string {
  return `${safeDisplayName(displayName)} <${address}>`;
}

/** The default follow-up date for a message sent today (ISO date). */
export function defaultFollowup(today: string): string {
  return addDays(today, DEFAULT_FOLLOWUP_DAYS);
}
