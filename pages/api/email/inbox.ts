import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { getUserFromToken, getUserEmailSettings, decrypt } from '../../../lib/emailHelper';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface InboxMessage {
  from: string;
  subject: string;
  receivedAt: string;
  venue: { id: any; name: any; city: any; state: any; } | null;
  preview: string;
}

function fetchUnseenMessages(imapConfig: Imap.Config): Promise<ParsedMail[]> {
  return new Promise((resolve, reject) => {
    const imap = new Imap(imapConfig);
    const messages: ParsedMail[] = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) { imap.end(); return reject(err); }

        const since = new Date();
        since.setDate(since.getDate() - 30);

        imap.search(['UNSEEN', ['SINCE', since]], (searchErr, results) => {
          if (searchErr) { imap.end(); return reject(searchErr); }
          if (!results || results.length === 0) { imap.end(); return resolve([]); }

          const fetch = imap.fetch(results, { bodies: '' });

          fetch.on('message', (msg) => {
            const chunks: Buffer[] = [];
            msg.on('body', (stream) => {
              stream.on('data', (chunk: Buffer) => chunks.push(chunk));
              stream.on('end', async () => {
                try {
                  const parsed = await simpleParser(Buffer.concat(chunks));
                  messages.push(parsed);
                } catch (_) {}
              });
            });
          });

          fetch.once('error', (fetchErr) => { imap.end(); reject(fetchErr); });
          fetch.once('end', () => imap.end());
        });
      });
    });

    imap.once('end', () => resolve(messages));
    imap.once('error', reject);
    imap.connect();
  });
}

async function matchVenueByEmail(fromAddress: string, userId: string) {
  const { data } = await supabase
    .from('venues')
    .select('id, name, city, state')
    .eq('user_id', userId)
    .ilike('email', fromAddress)
    .single();
  return data ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user     = await getUserFromToken(req.headers.authorization);
    const settings = await getUserEmailSettings(user.id);

    if (!settings.imap_host) {
      return res.status(400).json({
        error: 'IMAP not configured. Update your email settings to enable reply tracking.',
      });
    }

    const password = decrypt(settings.password_enc);

    const messages = await fetchUnseenMessages({
      user:     settings.username,
      password,
      host:     settings.imap_host,
      port:     settings.imap_port ?? 993,
      tls:      true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
    });

    const results: InboxMessage[] = [];

    for (const msg of messages) {
      const fromAddress = (msg.from?.value?.[0]?.address ?? '').toLowerCase();
      const subject     = msg.subject ?? '(no subject)';
      const body        = msg.text ?? msg.html ?? '';
      const receivedAt  = msg.date?.toISOString() ?? new Date().toISOString();

      const venue = await matchVenueByEmail(fromAddress, user.id);

      const messageId = msg.messageId ?? null;
      if (messageId) {
        const { data: existing } = await supabase
          .from('email_logs')
          .select('id')
          .eq('message_id', messageId)
          .single();
        if (existing) continue;
      }

      await supabase.from('email_logs').insert({
        user_id:      user.id,
        venue_id:     venue?.id    ?? null,
        direction:    'received',
        to_address:   settings.email_address,
        from_address: fromAddress,
        subject,
        body: typeof body === 'string' ? body.slice(0, 5000) : '',
        message_id:   messageId,
        sent_at:      receivedAt,
      });

      if (venue) {
        await supabase
          .from('venues')
          .update({ contact_status: 'replied', last_reply_at: receivedAt })
          .eq('id', venue.id);
      }

      results.push({
        from:      fromAddress,
        subject,
        receivedAt,
        venue:     venue ? { id: venue.id, name: venue.name, city: venue.city, state: venue.state } : null,
        preview:   typeof body === 'string' ? body.slice(0, 200) : '',
      });
    }

    return res.status(200).json({
      success: true,
      fetched: results.length,
      messages: results,
    });

  } catch (error: any) {
    console.error('Inbox fetch error:', error);

    if (error.message?.includes('No email account connected')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.source === 'authentication') {
      return res.status(400).json({
        error: 'IMAP authentication failed. Check your credentials in Settings → Email Account.',
      });
    }

    return res.status(500).json({ error: error.message || 'Failed to fetch inbox' });
  }
}
