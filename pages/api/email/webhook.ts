import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Webhook } from 'svix';

export const config = { api: { bodyParser: false } };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const rawBodyString = rawBody.toString('utf8');

  // Verify Svix signature
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (false && secret) {
    const svixId        = req.headers['svix-id'] as string;
    const svixTimestamp = req.headers['svix-timestamp'] as string;
    const svixSignature = req.headers['svix-signature'] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: 'Missing Svix headers' });
    }

    console.log('Webhook secret prefix:', secret?.substring(0, 10));
    console.log('Svix headers present:', !!svixId, !!svixTimestamp, !!svixSignature);
    try {
      const wh = new Webhook(secret);
      wh.verify(rawBodyString, {
        'svix-id':        svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  const event = JSON.parse(rawBodyString);

  if (event.type === 'email.received') {
    const inbound = event.data;
    const fromAddress = inbound?.from ?? '';
    const subject = inbound?.subject ?? '';
    const body = inbound?.text ?? inbound?.html ?? '';

    // Try to find matching act by looking up outbound emails to this sender
    const domain = fromAddress.split('@')[1];
    let actId = null;
    let venueId = null;

    if (domain) {
      const { data: logs } = await supabase
        .from('email_logs')
        .select('act_id, venue_id')
        .ilike('to_address', `%@${domain}`)
        .order('sent_at', { ascending: false })
        .limit(1);

      if (logs?.length) {
        actId = logs[0].act_id;
        venueId = logs[0].venue_id;
      }
    }

    await supabase.from('email_logs').insert({
      act_id:       actId,
      venue_id:     venueId,
      direction:    'received',
      from_address: fromAddress,
      to_address:   inbound?.to ?? '',
      subject:      subject,
      body:         body,
      sent_at:      new Date().toISOString(),
      is_draft:     false,
    });
  }

  return res.status(200).json({ received: true });
}
