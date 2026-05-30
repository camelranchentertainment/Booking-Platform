import { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

export const config = { api: { bodyParser: false } };

async function readRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Always return 200 — Resend retries on non-200
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const rawBody = await readRawBody(req);

  // Verify signature using Resend SDK (wraps Svix internally)
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const apiKey = process.env.RESEND_API_KEY || 'placeholder';
    const resendClient = new Resend(apiKey);
    try {
      resendClient.webhooks.verify({
        webhookSecret: secret,
        payload:       rawBody,
        headers: {
          id:        req.headers['svix-id'] as string        ?? '',
          timestamp: req.headers['svix-timestamp'] as string ?? '',
          signature: req.headers['svix-signature'] as string ?? '',
        },
      });
    } catch {
      // Invalid signature — still return 200 to avoid infinite retries
      return res.status(200).json({ ok: true });
    }
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return res.status(200).json({ ok: true }); }

  if (event.type !== 'email.received') return res.status(200).json({ ok: true });

  const inbound = event.data;
  const emailId  = inbound?.id ?? inbound?.email_id ?? null;
  const rawFrom  = inbound?.from;
  const fromAddress = (typeof rawFrom === 'string'
    ? rawFrom.replace(/^.*<(.+)>$/, '$1')
    : (rawFrom?.address ?? '')
  ).toLowerCase().trim();
  const subject = inbound?.subject ?? '';

  if (!fromAddress) return res.status(200).json({ ok: true });

  const service = getServiceClient();
  const now = new Date().toISOString();

  // Fetch full email body from Resend API; fall back to webhook payload
  let body: string = inbound?.text ?? inbound?.html ?? '';
  if (emailId) {
    try {
      const apiKey = await getSetting('resend_api_key') ?? process.env.RESEND_API_KEY;
      if (apiKey) {
        const emailRes = await fetch(`https://api.resend.com/emails/${emailId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (emailRes.ok) {
          const emailData = await emailRes.json();
          body = emailData.text ?? emailData.html ?? body;
        }
      }
    } catch {}
  }

  // Match from address to venues.email
  const { data: venues } = await service
    .from('venues')
    .select('id, name')
    .ilike('email', fromAddress);

  if (!venues?.length) return res.status(200).json({ ok: true });

  for (const venue of venues) {
    const { data: tourVenues } = await service
      .from('tour_venues')
      .select('id, tour_id, status')
      .eq('venue_id', venue.id)
      .in('status', ['target', 'pitched', 'waiting', 'follow_up'])
      .order('updated_at', { ascending: false })
      .limit(10);

    if (!tourVenues?.length) continue;

    for (const tv of tourVenues) {
      const { data: tour } = await service
        .from('tours')
        .select('id, act_id, acts(id, owner_id, act_name)')
        .eq('id', tv.tour_id)
        .single();

      if (!tour) continue;
      const act = tour.acts as any;
      if (!act?.owner_id) continue;

      // Update tour_venue status to 'follow_up' (venue replied)
      await service
        .from('tour_venues')
        .update({ status: 'waiting', last_replied_at: now, updated_at: now })
        .eq('id', tv.id);

      // Log the inbound email
      await service.from('email_log').insert({
        sent_by:       act.owner_id,
        venue_id:      venue.id,
        tour_venue_id: tv.id,
        act_id:        tour.act_id,
        direction:     'received',
        from_address:  fromAddress,
        subject,
        body:          body || null,
        recipient:     fromAddress,
        status:        'delivered',
        sent_at:       now,
      });

      // Notify act owner
      await service.from('notifications').insert({
        user_id:    act.owner_id,
        type:       'venue_replied',
        message:    `Reply from ${venue.name}: ${subject}`,
        action_url: `/tours/${tv.tour_id}`,
        related_id: tv.id,
        read:       false,
      });
    }
  }

  return res.status(200).json({ ok: true });
}
