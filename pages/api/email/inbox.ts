import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '../../../lib/supabase';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import crypto from 'crypto';
import { notifyActMembers } from '../../../lib/notifications';

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
  body: string;
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

  // Load user's act_id for scoping tour_venues updates
  const { data: profileRow } = await admin
    .from('user_profiles')
    .select('act_id')
    .eq('id', user.id)
    .maybeSingle();
  const actId = profileRow?.act_id || null;

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

    // Advance pitched → waiting for any matched venue replies
    if (actId) {
      const matchedVenueIds = [...new Set(enriched.map(m => m.matchedVenueId).filter(Boolean))] as string[];
      if (matchedVenueIds.length > 0) {
        const { data: tvs } = await admin
          .from('tour_venues')
          .select('id, tour:tours(act_id)')
          .in('venue_id', matchedVenueIds)
          .eq('status', 'pitched');

        const toAdvance = (tvs || []).filter((tv: any) => tv.tour?.act_id === actId).map((tv: any) => tv.id);
        if (toAdvance.length > 0) {
          await admin.from('tour_venues')
            .update({ status: 'waiting', updated_at: new Date().toISOString() })
            .in('id', toAdvance);

          const venueNames = [...new Set(enriched
            .filter(m => m.matchedVenueId && toAdvance.some(() => true))
            .map(m => m.matchedVenueName).filter(Boolean))];
          if (actId && venueNames.length > 0) {
            await notifyActMembers({
              actId,
              type:      'venue_replied',
              message:   `Venue replied: ${venueNames.slice(0, 2).join(', ')}${venueNames.length > 2 ? ` +${venueNames.length - 2} more` : ''}`,
              actionUrl: '/email',
            });
          }
        }
      }
    }

    return res.status(200).json({ messages: enriched, configured: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'IMAP connection failed', configured: true });
  }
}

async function fetchImapMessages(
  host: string, port: number, user: string, password: string
): Promise<Omit<InboxMessage, 'matchedVenueId' | 'matchedVenueName'>[]> {
  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass: password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  await client.connect();
  const messages: Omit<InboxMessage, 'matchedVenueId' | 'matchedVenueName'>[] = [];

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const uids = await client.search({ since }, { uid: true });
      const uidList = Array.isArray(uids) ? uids : [];

      if (uidList.length > 0) {
        const limited = uidList.slice(-50);
        for await (const msg of client.fetch(limited, { source: true }, { uid: true })) {
          try {
            const parsed = await simpleParser(msg.source as Buffer);
            const fromAddr = (parsed.from?.value?.[0]) as any;
            const fromEmail = fromAddr?.address || '';
            const fromName  = fromAddr?.name || fromEmail;
            const bodyText  = parsed.text || '';
            messages.push({
              uid:     msg.uid,
              from:    fromName,
              fromEmail,
              subject: parsed.subject || '(no subject)',
              date:    parsed.date?.toISOString() || '',
              preview: bodyText.slice(0, 160).replace(/\s+/g, ' '),
              body:    bodyText.trim(),
            });
          } catch { /* skip unparseable */ }
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return messages.sort((a, b) => b.date.localeCompare(a.date));
}
