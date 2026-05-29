import { NextApiRequest, NextApiResponse } from 'next';
import { createHmac, timingSafeEqual } from 'crypto';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Always return 200 — Resend retries on any non-200
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  // Verify Resend/Svix webhook signature
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers['svix-signature'] as string | undefined;
    const ts  = req.headers['svix-timestamp'] as string | undefined;
    const id  = req.headers['svix-id'] as string | undefined;
    if (!sig || !ts || !id) return res.status(200).json({ ok: true });

    const toSign   = `${id}.${ts}.${JSON.stringify(req.body)}`;
    const expected = createHmac('sha256', secret).update(toSign).digest('hex');
    const sigs     = sig.split(' ').map(s => s.split(',')[1]).filter(Boolean);
    const valid    = sigs.some(s => {
      try { return timingSafeEqual(Buffer.from(s, 'hex'), Buffer.from(expected, 'hex')); }
      catch { return false; }
    });
    if (!valid) return res.status(200).json({ ok: true });
  }

  const event = req.body;
  if (event.type !== 'email.received') return res.status(200).json({ ok: true });

  const inbound = event.data;
  const emailId = inbound?.id ?? inbound?.email_id ?? null;
  const rawFrom = inbound?.from;
  const fromAddress = (typeof rawFrom === 'string'
    ? rawFrom.replace(/^.*<(.+)>$/, '$1')  // extract "addr@host" from "Name <addr@host>"
    : rawFrom?.address ?? ''
  ).toLowerCase().trim();
  const subject = inbound?.subject ?? '';

  if (!fromAddress) return res.status(200).json({ ok: true });

  const service = getServiceClient();
  const now = new Date().toISOString();

  // Fetch full email body from Resend API — falls back to webhook payload
  let body: string = inbound?.text ?? inbound?.html ?? '';
  if (emailId) {
    try {
      const apiKey = await getSetting('resend_api_key') || process.env.RESEND_API_KEY;
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

  // Find venues whose email matches the sender
  const { data: venues } = await service
    .from('venues')
    .select('id, name')
    .ilike('email', fromAddress);

  if (!venues?.length) return res.status(200).json({ ok: true });

  for (const venue of venues) {
    // Find active tour_venues for this venue that haven't already been marked as responded
    const { data: tourVenues } = await service
      .from('tour_venues')
      .select('id, tour_id, status')
      .eq('venue_id', venue.id)
      .in('status', ['target', 'reached_out', 'negotiating'])
      .order('updated_at', { ascending: false })
      .limit(10);

    if (!tourVenues?.length) continue;

    for (const tv of tourVenues) {
      // Resolve act and owner via tour
      const { data: tour } = await service
        .from('tours')
        .select('id, act_id, acts(id, owner_id, act_name)')
        .eq('id', tv.tour_id)
        .single();

      if (!tour) continue;
      const act = tour.acts as any;
      if (!act?.owner_id) continue;

      // Mark venue as responded
      await service
        .from('tour_venues')
        .update({ status: 'responded', last_replied_at: now, updated_at: now })
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

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };
