import type { NextApiRequest, NextApiResponse } from 'next';
import { getSetting } from '../../../lib/platformSettings';

const REQUIRED = ['name', 'email', 'venue', 'date', 'artist'] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body as Record<string, string>;
  for (const field of REQUIRED) {
    if (!body[field]?.trim()) return res.status(400).json({ error: `${field} is required` });
  }

  const apiKey   = await getSetting('resend_api_key');
  const fromAddr = await getSetting('resend_from_email');

  if (!apiKey || !fromAddr) {
    // Accept the submission but skip email if Resend isn't configured yet
    return res.status(200).json({ ok: true, note: 'email_not_configured' });
  }

  const html = `
    <h2 style="font-family:sans-serif;color:#C8921A">New Booking Inquiry</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap">Name</td><td>${esc(body.name)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap">Email</td><td><a href="mailto:${esc(body.email)}">${esc(body.email)}</a></td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap">Venue / Event</td><td>${esc(body.venue)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap">Proposed Date</td><td>${esc(body.date)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap">Artist</td><td>${esc(body.artist)}</td></tr>
      ${body.notes?.trim() ? `<tr><td style="padding:6px 12px 6px 0;color:#888;vertical-align:top">Notes</td><td>${esc(body.notes)}</td></tr>` : ''}
    </table>
  `;

  const mailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddr,
      to:   [fromAddr],
      reply_to: body.email,
      subject: `Booking Inquiry — ${body.name} / ${body.venue}`,
      html,
    }),
  });

  if (!mailRes.ok) {
    const detail = await mailRes.text();
    console.error('Resend error:', detail);
    return res.status(502).json({ error: 'Failed to send email. Please try again.' });
  }

  return res.json({ ok: true });
}

function esc(s: string) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
