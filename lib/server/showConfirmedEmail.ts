// lib/server/showConfirmedEmail.ts
// The "New show confirmed" email sent to a band's members when a tour target
// is confirmed (pages/api/tours/venue-confirm.ts).
//
// Members never see the band's money (CLAUDE.md), so this template has no fee
// input at all — it can't leak one. Every value is HTML-escaped.
import { escapeHtml } from './memberInvite';

export interface ShowConfirmedEmailInput {
  memberName: string | null;
  actName: string;
  venueName: string;
  city: string | null;
  state: string | null;
  /** Already formatted, e.g. "Friday, December 4, 2026". */
  date: string;
}

export function showConfirmedSubject(i: Pick<ShowConfirmedEmailInput, 'actName' | 'venueName'>): string {
  return `New Show Confirmed: ${i.actName} @ ${i.venueName}`;
}

export function showConfirmedHtml(i: ShowConfirmedEmailInput): string {
  const where = [i.city, i.state].filter(Boolean).join(', ');
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:1.5rem">
  <h2 style="color:#c49a3c;margin-top:0">New Show Confirmed</h2>
  <p>Hi ${escapeHtml(i.memberName || 'there')},</p>
  <p>A new show has been confirmed for <strong>${escapeHtml(i.actName)}</strong>:</p>
  <table style="background:#f8f8f8;border-radius:8px;padding:1rem;width:100%;border-collapse:collapse">
    <tr><td style="padding:0.3rem 0.5rem;font-weight:600">Venue</td><td>${escapeHtml(i.venueName)}</td></tr>
    ${where ? `<tr><td style="padding:0.3rem 0.5rem;font-weight:600">Location</td><td>${escapeHtml(where)}</td></tr>` : ''}
    <tr><td style="padding:0.3rem 0.5rem;font-weight:600">Date</td><td>${escapeHtml(i.date)}</td></tr>
  </table>
  <p style="margin-top:1.5rem">Log in to Camel Ranch Booking for full details.</p>
</div>`;
}
