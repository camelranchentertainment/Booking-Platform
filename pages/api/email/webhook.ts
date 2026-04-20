import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { createHmac, timingSafeEqual } from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Verify Resend webhook signature
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers['svix-signature'] as string | undefined;
    const ts  = req.headers['svix-timestamp'] as string | undefined;
    const id  = req.headers['svix-id'] as string | undefined;
    if (!sig || !ts || !id) return res.status(400).json({ error: 'Missing signature headers' });

    const rawBody = JSON.stringify(req.body);
    const toSign  = `${id}.${ts}.${rawBody}`;
    const expected = createHmac('sha256', secret).update(toSign).digest('hex');
    const sigs = sig.split(' ').map(s => s.split(',')[1]).filter(Boolean);
    const valid = sigs.some(s => {
      try { return timingSafeEqual(Buffer.from(s, 'hex'), Buffer.from(expected, 'hex')); }
      catch { return false; }
    });
    if (!valid) return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  const supabase = getServiceClient();

  const statusMap: Record<string, 'sent' | 'delivered' | 'bounced' | 'failed'> = {
    'email.delivered':        'delivered',
    'email.bounced':          'bounced',
    'email.complained':       'bounced',
    'email.delivery_delayed': 'sent',
  };

  const newStatus = statusMap[event.type];
  if (newStatus && event.data?.email_id) {
    await supabase
      .from('email_log')
      .update({ status: newStatus })
      .eq('resend_id', event.data.email_id);
  }

  // Inbound reply detection: Resend routes inbound email to this webhook
  // when you set up inbound routing on your domain.
  if (event.type === 'email.received') {
    const inbound = event.data;
    const fromAddress = inbound?.from?.address?.toLowerCase() ?? '';
    const subject = inbound?.subject ?? '';
    const body = inbound?.text ?? inbound?.html ?? '';

    // Find the most recent outbound email to this sender's domain
    const domain = fromAddress.split('@')[1];
    if (domain) {
      const { data: logs } = await supabase
        .from('email_log')
        .select('id, agent_id, recipient, subject, venue_id, booking_id')
        .ilike('recipient', `%@${domain}`)
        .order('sent_at', { ascending: false })
        .limit(1);

      if (logs?.length) {
        const matched = logs[0];

        // Insert a "reply received" alert row so agent sees it in their feed
        await supabase.from('email_log').insert({
          sent_by:    matched.agent_id,
          venue_id:   matched.venue_id,
          booking_id: matched.booking_id,
          subject:    `REPLY: ${subject}`,
          recipient:  fromAddress,
          status:     'delivered',
          template_id: 'inbound_reply',
          resend_id:  inbound?.id ?? null,
        });
      }
    }
  }

  return res.status(200).json({ received: true });
}

// Resend sends JSON body — don't use bodyParser size limit
export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
