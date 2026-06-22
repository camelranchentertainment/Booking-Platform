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

  // Verify Svix signature — uses the same svix library Resend wraps internally
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Secret not configured — reject without processing to avoid unauthenticated ingestion.
    // Set RESEND_WEBHOOK_SECRET in Vercel env vars to enable this route.
    console.error('[email/webhook] RESEND_WEBHOOK_SECRET not set; request rejected without processing');
    return res.status(200).json({ ok: true });
  }

  const svixId        = req.headers['svix-id'] as string;
  const svixTimestamp = req.headers['svix-timestamp'] as string;
  const svixSignature = req.headers['svix-signature'] as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    // Missing headers — return 200 to avoid Resend retry loops
    return res.status(200).json({ ok: true });
  }

  try {
    const wh = new Webhook(secret);
    wh.verify(rawBodyString, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch {
    // Invalid signature — return 200 to avoid Resend retry loops
    return res.status(200).json({ ok: true });
  }

  const event = JSON.parse(rawBodyString);

  if (event.type === 'email.received') {
    const inbound = event.data;
    const fromAddress = inbound?.from ?? '';
    const subject = inbound?.subject ?? '';
    const body = inbound?.text ?? inbound?.html ?? '';

    // Try to find matching act by looking up outbound emails sent to this sender's domain
    const domain = fromAddress.split('@')[1];
    let actId = null;
    let venueId = null;

    if (domain) {
      const { data: logs } = await supabase
        .from('email_log')
        .select('act_id, venue_id')
        .ilike('recipient', `%@${domain}`)
        .neq('direction', 'received')
        .order('sent_at', { ascending: false })
        .limit(1);

      if (logs?.length) {
        actId = logs[0].act_id;
        venueId = logs[0].venue_id;
      }
    }

    // Resend may deliver to_address as a JSON array or a plain string
    const toRaw = inbound?.to;
    const recipient = Array.isArray(toRaw) ? toRaw[0] : (typeof toRaw === 'string' ? toRaw : '');

    await supabase.from('email_log').insert({
      act_id:       actId,
      venue_id:     venueId,
      direction:    'received',
      from_address: fromAddress,
      recipient,
      subject,
      body:         body || null,
      status:       'delivered',
      sent_at:      new Date().toISOString(),
      is_draft:     false,
    });
  }

  return res.status(200).json({ received: true });
}
