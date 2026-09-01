import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { getGmailClient } from '../../../lib/gmailClient';
import { notifyActMembers } from '../../../lib/notifications';

function decodeBase64Url(data?: string | null): string {
  if (!data) return '';

  try {
    const normalized = data
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    return Buffer.from(normalized, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }> = [],
  name: string,
): string {
  return (
    headers.find(
      header => header.name?.toLowerCase() === name.toLowerCase(),
    )?.value || ''
  );
}

function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);

  return (match?.[1] || value)
    .trim()
    .toLowerCase();
}

function extractMessageBody(payload: any): string {
  if (!payload) return '';

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  const parts = payload.parts || [];

  // Prefer plain text
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
  }

  // Fall back to HTML
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
  }

  // Handle nested multipart messages
  for (const part of parts) {
    const nested = extractMessageBody(part);
    if (nested) return nested;
  }

  return '';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const service = getServiceClient();

  const {
    data: { user },
  } = await service.auth.getUser(token);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Determine which act this user belongs to
  const { data: profile } = await service
    .from('profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .maybeSingle();

  const actId = profile?.act_id;

  if (!actId) {
    return res.status(400).json({ error: 'No act associated with user' });
  }

  if (!['band_admin', 'superadmin'].includes(profile?.role || '')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { gmail, gmailAddress } = await getGmailClient(actId);

    if (!gmailAddress) {
      return res.status(400).json({ error: 'Gmail is not connected' });
    }

    // Load venue email addresses
    const { data: venues } = await service
      .from('venues')
      .select('id, name, email, secondary_emails');

    const venueEmailMap = new Map<
      string,
      { id: string; name: string }
    >();

    for (const venue of venues || []) {
      if (venue.email) {
        venueEmailMap.set(venue.email.toLowerCase(), {
          id: venue.id,
          name: venue.name,
        });
      }

      for (const email of venue.secondary_emails || []) {
        venueEmailMap.set(email.toLowerCase(), {
          id: venue.id,
          name: venue.name,
        });
      }
    }

    // Include individual venue contacts
    const { data: contacts } = await service
      .from('contacts')
      .select('email, venue_id, venue:venues(name)')
      .not('email', 'is', null);

    for (const contact of contacts || []) {
      if (!contact.email || !contact.venue_id) continue;

      venueEmailMap.set(contact.email.toLowerCase(), {
        id: contact.venue_id,
        name: (contact.venue as any)?.name || '',
      });
    }

    // Only look at recent messages in the Gmail inbox.
    // The first sync can bring in up to 50 recent messages.
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox newer_than:30d',
      maxResults: 50,
    });

    const gmailMessages = listResponse.data.messages || [];

    let imported = 0;
    let skipped = 0;
    let unmatched = 0;

    const notifiedVenues = new Set<string>();

    for (const gmailMessage of gmailMessages) {
      if (!gmailMessage.id) continue;

      // Deduplicate using Gmail's unique message ID
      const { data: existing } = await service
        .from('email_log')
        .select('id')
        .eq('act_id', actId)
        .eq('message_id', gmailMessage.id)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: gmailMessage.id,
        format: 'full',
      });

      const payload = fullMessage.data.payload;
      const headers = payload?.headers || [];

      const rawFrom = getHeader(headers, 'From');
      const fromAddress = extractEmailAddress(rawFrom);

      if (!fromAddress) {
        skipped++;
        continue;
      }

      // Never import the connected Gmail account's own messages
      if (fromAddress === gmailAddress.toLowerCase()) {
        skipped++;
        continue;
      }

      const subject = getHeader(headers, 'Subject') || '(no subject)';
      const body = extractMessageBody(payload);

      const internalDate = fullMessage.data.internalDate
        ? new Date(Number(fullMessage.data.internalDate)).toISOString()
        : new Date().toISOString();

      // Exact address match first
      let matchedVenue = venueEmailMap.get(fromAddress) || null;

      // Fallback to matching the sender domain
      if (!matchedVenue) {
        const senderDomain = fromAddress.split('@')[1];

        if (senderDomain) {
          for (const [email, venue] of venueEmailMap.entries()) {
            if (email.endsWith(`@${senderDomain}`)) {
              matchedVenue = venue;
              break;
            }
          }
        }
      }

      if (!matchedVenue) {
        unmatched++;
        continue;
      }

      // Find the most recently updated matching tour venue for this act.
      const { data: tourVenues } = await service
        .from('tour_venues')
        .select(`
          id,
          tour_id,
          status,
          updated_at,
          tour:tours!inner(id, act_id)
        `)
        .eq('venue_id', matchedVenue.id)
        .eq('tour.act_id', actId)
        .in('status', [
          'target',
          'follow_up',
          'confirmed',
          'declined',
          'thank_you',
        ])
        .order('updated_at', { ascending: false })
        .limit(1);

      const tourVenue = tourVenues?.[0] || null;

      // A matched venue may not currently belong to a tour.
      // We still want the email in the Inbox.
      const { error: insertError } = await service
        .from('email_log')
        .insert({
          sent_by: user.id,
          venue_id: matchedVenue.id,
          tour_venue_id: tourVenue?.id || null,
          act_id: actId,
          direction: 'received',
          from_address: fromAddress,
          recipient: gmailAddress,
          subject,
          body: body || null,
          message_id: gmailMessage.id,
          status: 'delivered',
          sent_at: internalDate,
        });

      if (insertError) {
        console.error(
          'Gmail sync email_log insert failed:',
          insertError,
        );
        continue;
      }

      // Record that the venue replied, but DO NOT change outreach status.
      if (tourVenue?.id) {
        await service
          .from('tour_venues')
          .update({
            last_replied_at: internalDate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tourVenue.id);
      }

      imported++;
      notifiedVenues.add(matchedVenue.name);
    }

    if (notifiedVenues.size > 0) {
      const names = [...notifiedVenues];

      await notifyActMembers({
        actId,
        type: 'venue_replied',
        message: `Venue replied: ${names.slice(0, 2).join(', ')}${
          names.length > 2 ? ` +${names.length - 2} more` : ''
        }`,
        actionUrl: '/email',
      });
    }

    return res.status(200).json({
      ok: true,
      imported,
      skipped,
      unmatched,
      scanned: gmailMessages.length,
    });
  } catch (err: any) {
    console.error('Gmail inbox sync failed:', err);

    return res.status(500).json({
      error: err?.message || 'Gmail inbox sync failed',
    });
  }
}