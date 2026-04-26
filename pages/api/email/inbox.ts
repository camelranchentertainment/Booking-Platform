import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '../../../lib/supabase';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import crypto from 'crypto';
import { Readable } from 'stream';

function decrypt(enc: string): string {
  const key = process.env.EMAIL_ENCRYPT_KEY || '';
  if (!key || !enc) return enc;
  try {
    const [ivHex, encrypted] = enc.split(':');
    const iv  = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    return enc;
  }
}

type InboxMessage = {
  uid: number;
  from: string;
  fromEmail: string;
  subject: string;
  date: string;
  preview: string;
  matchedVenueId: string | null;
  matchedVenueName: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authErr } = await client.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  const admin = getServiceClient();

  // Load IMAP settings
  const { data: settings } = await admin
    .from('user_email_settings')
    .select('imap_host, imap_port, username, password_enc')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!settings?.imap_host || !settings?.username) {
    return res.status(200).json({ messages: [], configured: false });
  }

  const password = settings.password_enc ? decrypt(settings.password_enc) : '';

  // Load venue emails for matching
  const { data: venues } = await admin
    .from('venues')
    .select('id, name, email, secondary_emails')
    .not('email', 'is', null);

  const venueEmailMap: Record<string, { id: string; name: string }> = {};
  for (const v of venues || []) {
    if (v.email) venueEmailMap[v.email.toLowerCase()] = { id: v.id, name: v.name };
    for (const e of v.secondary_emails || []) {
      venueEmailMap[e.toLowerCase()] = { id: v.id, name: v.name };
    }
  }

  // Also load contact emails
  const { data: contacts } = await admin
    .from('contacts')
    .select('email, venue_id, venue:venues(name)')
    .not('email', 'is', null);

  for (const c of contacts || []) {
    if (c.email && c.venue_id) {
      venueEmailMap[c.email.toLowerCase()] = { id: c.venue_id, name: (c.venue as any)?.name || '' };
    }
  }

  try {
    const messages = await fetchImapMessages(settings.imap_host, settings.imap_port || 993, settings.username, password);

    const enriched: InboxMessage[] = messages.map(m => {
      const fromDomain = m.fromEmail.split('@')[1] || '';
      let matched = venueEmailMap[m.fromEmail.toLowerCase()] || null;
      // Fallback: match by domain against venue emails
      if (!matched) {
        for (const [email, venue] of Object.entries(venueEmailMap)) {
          if (email.endsWith('@' + fromDomain)) { matched = venue; break; }
        }
      }
      return {
        ...m,
        matchedVenueId:   matched?.id   || null,
        matchedVenueName: matched?.name || null,
      };
    });

    return res.status(200).json({ messages: enriched, configured: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'IMAP connection failed', configured: true });
  }
}

function fetchImapMessages(host: string, port: number, user: string, password: string): Promise<Omit<InboxMessage, 'matchedVenueId' | 'matchedVenueName'>[]> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user,
      password,
      host,
      port,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 5000,
    });

    const messages: Omit<InboxMessage, 'matchedVenueId' | 'matchedVenueName'>[] = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) { imap.end(); reject(err); return; }

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const dateStr = thirtyDaysAgo.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');

        imap.search([['SINCE', dateStr]], (searchErr, uids) => {
          if (searchErr || !uids.length) { imap.end(); resolve([]); return; }

          const limited = uids.slice(-50); // last 50 messages
          const fetch = imap.fetch(limited, { bodies: '' });
          const pending: Promise<void>[] = [];

          fetch.on('message', (msg, seqno) => {
            let uid = seqno;
            const p = new Promise<void>(res2 => {
              const chunks: Buffer[] = [];
              msg.on('body', stream => {
                (stream as any).on('data', (chunk: Buffer) => chunks.push(chunk));
                (stream as any).on('end', async () => {
                  try {
                    const buf = Buffer.concat(chunks);
                    const readable = Readable.from(buf);
                    const parsed = await simpleParser(readable as any);
                    const fromAddr = (parsed.from?.value?.[0]) as any;
                    const fromEmail = fromAddr?.address || '';
                    const fromName  = fromAddr?.name || fromEmail;
                    const body = parsed.text || '';
                    messages.push({
                      uid,
                      from:      fromName,
                      fromEmail,
                      subject:   parsed.subject || '(no subject)',
                      date:      parsed.date?.toISOString() || '',
                      preview:   body.slice(0, 160).replace(/\s+/g, ' '),
                    });
                  } catch { /* skip unparseable */ }
                  res2();
                });
              });
              msg.on('attributes', attrs => { uid = attrs.uid; });
            });
            pending.push(p);
          });

          fetch.once('end', async () => {
            await Promise.all(pending);
            imap.end();
          });
        });
      });
    });

    imap.once('error', (err: Error) => reject(err));
    imap.once('end', () => resolve(messages.sort((a, b) => b.date.localeCompare(a.date))));
    imap.connect();
  });
}
