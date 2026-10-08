import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { getGmailClient } from '../../../lib/gmailClient';
import { notifyActMembers } from '../../../lib/notifications';
import { loadVenueEmailIndex, matchSenderToVenue } from '../../../lib/server/venueEmailMatch';
import type {
  InboxSyncErrorBody,
  InboxSyncErrorCode,
  InboxSyncSuccessBody,
  InboxSyncTrigger,
} from '../../../lib/inboxSync';

/**
 * Minimum gap between Gmail syncs for one act. Auto checks run every 2.5 min
 * per tab; the throttle stops several tabs or admins from multiplying that.
 * Manual "Check Gmail now" clicks get a shorter gap so the button feels responsive.
 */
const MIN_GAP_MS: Record<InboxSyncTrigger, number> = {
  auto: 60_000,
  manual: 10_000,
};

function sendError(
  res: NextApiResponse,
  status: number,
  code: InboxSyncErrorCode,
  message: string,
): void {
  const body: InboxSyncErrorBody = { error: { code, message } };
  res.status(status).json(body);
}

function parseTrigger(body: unknown): InboxSyncTrigger {
  if (typeof body === 'object' && body !== null && (body as { trigger?: unknown }).trigger === 'manual') {
    return 'manual';
  }
  return 'auto';
}

type ThrottleResult =
  | { allowed: true; startedAt: string }
  | { allowed: false; lastSyncedAt: string | null };

/**
 * Atomically claim this act's sync slot: a single conditional UPDATE succeeds
 * only if the last sync started more than MIN_GAP_MS ago. Two simultaneous
 * requests cannot both win.
 *
 * Fails OPEN (allows the sync) if the column is missing or the update errors,
 * so a deploy that lands before the migration still works — just unthrottled.
 */
async function claimSyncSlot(
  service: ReturnType<typeof getServiceClient>,
  actId: string,
  trigger: InboxSyncTrigger,
): Promise<ThrottleResult> {
  const now = new Date();
  const startedAt = now.toISOString();
  const cutoff = new Date(now.getTime() - MIN_GAP_MS[trigger]).toISOString();

  const { data: claimed, error } = await service
    .from('act_credentials')
    .update({ gmail_last_sync_at: startedAt })
    .eq('act_id', actId)
    .or(`gmail_last_sync_at.is.null,gmail_last_sync_at.lt."${cutoff}"`)
    .select('gmail_last_sync_at')
    .maybeSingle();

  if (error) {
    console.error('Gmail sync throttle claim failed (allowing sync):', error.message);
    return { allowed: true, startedAt };
  }
  if (claimed) return { allowed: true, startedAt };

  const { data: current } = await service
    .from('act_credentials')
    .select('gmail_last_sync_at')
    .eq('act_id', actId)
    .maybeSingle();

  return { allowed: false, lastSyncedAt: (current?.gmail_last_sync_at as string | null) ?? null };
}

function isGmailAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /invalid_grant|invalid_client|unauthorized_client|Invalid Credentials/i.test(msg);
}

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
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }

  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  }

  const service = getServiceClient();

  const {
    data: { user },
  } = await service.auth.getUser(token);

  if (!user) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Unauthorized');
  }

  // Determine which act this user belongs to
  const { data: profile } = await service
    .from('profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .maybeSingle();

  const actId = profile?.act_id;

  if (!actId) {
    return sendError(res, 400, 'NO_ACT', 'No act associated with user');
  }

  if (!['band_admin', 'superadmin'].includes(profile?.role || '')) {
    return sendError(res, 403, 'FORBIDDEN', 'Forbidden');
  }

  const trigger = parseTrigger(req.body);

  // getGmailClient throws when the act has no refresh token; that's "not
  // connected", not a server fault, so the client can stop polling.
  let gmail: Awaited<ReturnType<typeof getGmailClient>>['gmail'];
  let gmailAddress: string | null;
  try {
    ({ gmail, gmailAddress } = await getGmailClient(actId));
  } catch {
    return sendError(res, 409, 'GMAIL_NOT_CONNECTED', 'Gmail is not connected');
  }
  if (!gmailAddress) {
    return sendError(res, 409, 'GMAIL_NOT_CONNECTED', 'Gmail is not connected');
  }

  const slot = await claimSyncSlot(service, actId, trigger);
  if (!slot.allowed) {
    const throttled: InboxSyncSuccessBody = {
      ok: true,
      status: 'throttled',
      imported: 0,
      skipped: 0,
      unmatched: 0,
      scanned: 0,
      last_synced_at: slot.lastSyncedAt,
    };
    return res.status(200).json(throttled);
  }

  try {

    const connectedAddress = gmailAddress.toLowerCase();

    // This band's venue + contact addresses only (see lib/server/venueEmailMatch).
    const venueIndex = await loadVenueEmailIndex(service, actId);

    // Only look at recent messages in the Gmail inbox.
    // The first sync can bring in up to 50 recent messages.
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox newer_than:30d',
      maxResults: 50,
    });

    const gmailMessages = listResponse.data.messages || [];

    // De-duplicate in ONE query instead of one round-trip per message —
    // this now runs every few minutes. Uses idx_email_log_act_message_id.
    const gmailIds = gmailMessages
      .map(m => m.id)
      .filter((id): id is string => Boolean(id));

    const alreadyImported = new Set<string>();
    if (gmailIds.length > 0) {
      const { data: existingRows, error: existingError } = await service
        .from('email_log')
        .select('message_id')
        .eq('act_id', actId)
        .in('message_id', gmailIds);

      if (existingError) {
        // Without the de-dupe set every message would be re-imported. Abort.
        throw new Error(`email_log de-dupe lookup failed: ${existingError.message}`);
      }
      for (const row of existingRows || []) {
        if (row.message_id) alreadyImported.add(row.message_id as string);
      }
    }

    let imported = 0;
    let skipped = 0;
    let unmatched = 0;

    const notifiedVenues = new Set<string>();

    for (const gmailMessage of gmailMessages) {
      if (!gmailMessage.id) continue;

      // Deduplicate using Gmail's unique message ID
      if (alreadyImported.has(gmailMessage.id)) {
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
      if (fromAddress === connectedAddress) {
        skipped++;
        continue;
      }

      const subject = getHeader(headers, 'Subject') || '(no subject)';
      const body = extractMessageBody(payload);

      const internalDate = fullMessage.data.internalDate
        ? new Date(Number(fullMessage.data.internalDate)).toISOString()
        : new Date().toISOString();

      // Exact address first; company-domain fallback only, never gmail.com etc.
      const matchedVenue = matchSenderToVenue(venueIndex, fromAddress);

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

    const result: InboxSyncSuccessBody = {
      ok: true,
      status: 'synced',
      imported,
      skipped,
      unmatched,
      scanned: gmailMessages.length,
      last_synced_at: slot.startedAt,
    };
    return res.status(200).json(result);
  } catch (err: unknown) {
    if (isGmailAuthError(err)) {
      console.error('Gmail inbox sync: Google rejected the stored credentials', { actId });
      return sendError(res, 502, 'GMAIL_AUTH_FAILED', 'Gmail sign-in expired. Reconnect Gmail in Settings.');
    }
    console.error('Gmail inbox sync failed:', { actId, message: err instanceof Error ? err.message : String(err) });
    return sendError(res, 500, 'SYNC_FAILED', 'Inbox check failed');
  }
}