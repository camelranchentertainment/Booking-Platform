// pages/api/agent-conversation.ts
// Day-by-day saved chats for the band assistant on /band.
//
//   GET    ?day=YYYY-MM-DD   that day's chat (today's to continue, or a past day to read)
//   GET    ?view=days        past days for History, newest first (preview + count only)
//   PUT    { day, messages } save today's chat
//   DELETE ?day=YYYY-MM-DD   "New Chat": clear today's chat
//
// "day" is the browser's local calendar day. Past days are read-only: PUT and
// DELETE only accept a day within one calendar day of the server's UTC date
// (see isWritableDay), so History can't be rewritten or wiped from the client.
//
// Service-role route: the caller must be a band admin, and user_id / act_id
// always come from the caller's own profile, never from the request.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../lib/supabase';
import { AppError, withHandler } from '../../lib/apiError';
import { requireBandAdmin } from '../../lib/server/requireBandAdmin';
import {
  HISTORY_DAYS_LIMIT,
  countMessages,
  isValidDay,
  isWritableDay,
  previewOf,
  sanitizeMessages,
  type ConversationDaySummary,
} from '../../lib/agentConversationDays';

const TABLE = 'agent_conversations';

/** Reads ?day= (or body.day) and insists on a real YYYY-MM-DD date. */
function readDay(req: NextApiRequest): string {
  const raw = typeof req.query.day === 'string' ? req.query.day : (req.body as { day?: unknown } | undefined)?.day;
  if (!isValidDay(raw)) throw new AppError(400, 'A valid day (YYYY-MM-DD) is required.');
  return raw;
}

/** Past days stay as history; only today's chat may change. */
function assertWritable(day: string): void {
  if (!isWritableDay(day)) throw new AppError(409, "Past days are saved history and can't be changed.");
}

/**
 * GET/PUT/DELETE the caller's assistant chat for one day, or list past days.
 *
 * @throws AppError 400 bad day or message list, 401/403 from requireBandAdmin,
 *         405 other methods, 409 when writing to a past day
 */
async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const service = getServiceClient();
  const { userId, actId } = await requireBandAdmin(req, service);

  if (req.method === 'GET') {
    if (req.query.view === 'days') {
      const { data, error } = await service
        .from(TABLE)
        .select('day, messages, updated_at')
        .eq('user_id', userId)
        .eq('act_id', actId)
        .order('day', { ascending: false })
        .limit(HISTORY_DAYS_LIMIT);
      if (error) throw new Error(`agent_conversations list failed: ${error.message}`);

      const days: ConversationDaySummary[] = (data ?? [])
        .map(row => ({
          day: String(row.day),
          preview: previewOf(row.messages),
          messageCount: countMessages(row.messages),
          updatedAt: row.updated_at ?? null,
        }))
        // A day where only the greeting was shown isn't worth listing.
        .filter(d => d.preview.length > 0);
      return res.status(200).json({ days });
    }

    const day = readDay(req);
    const { data, error } = await service
      .from(TABLE)
      .select('messages, updated_at')
      .eq('user_id', userId)
      .eq('act_id', actId)
      .eq('day', day)
      .maybeSingle();
    if (error) throw new Error(`agent_conversations read failed: ${error.message}`);
    return res.status(200).json({
      day,
      messages: sanitizeMessages(data?.messages) ?? [],
      updated_at: data?.updated_at ?? null,
      readOnly: !isWritableDay(day),
    });
  }

  if (req.method === 'PUT') {
    const day = readDay(req);
    assertWritable(day);
    const messages = sanitizeMessages((req.body as { messages?: unknown } | undefined)?.messages);
    if (!messages) throw new AppError(400, 'messages must be an array.');

    const { error } = await service
      .from(TABLE)
      .upsert(
        { user_id: userId, act_id: actId, day, messages, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,act_id,day' },
      );
    if (error) throw new Error(`agent_conversations save failed: ${error.message}`);
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const day = readDay(req);
    assertWritable(day);
    const { error } = await service
      .from(TABLE)
      .delete()
      .eq('user_id', userId)
      .eq('act_id', actId)
      .eq('day', day);
    if (error) throw new Error(`agent_conversations clear failed: ${error.message}`);
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  throw new AppError(405, 'Method not allowed');
}

export default withHandler(handler);
