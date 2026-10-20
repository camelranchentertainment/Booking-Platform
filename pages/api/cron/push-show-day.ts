// pages/api/cron/push-show-day.ts
//
// Daily at 14:00 UTC (9 AM Central, 7 AM Pacific, 10 AM Eastern — the same
// calendar date across the US): push a "show day" reminder to the phone app
// for every confirmed show today. Scheduled in vercel.json.
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendShowDayReminders } from '../../../lib/server/push';

/**
 * Vercel Cron entry point. Only Vercel (holding CRON_SECRET) may trigger it.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const today = new Date().toISOString().slice(0, 10);

  try {
    const result = await sendShowDayReminders(service, today);
    console.log('[cron/push-show-day] done', { date: today, ...result, deadTokens: result.deadTokens.length });
    return res.status(200).json({ ok: true, date: today, shows: result.shows, sent: result.sent, failed: result.failed });
  } catch (err) {
    console.error('[cron/push-show-day] failed', { date: today, error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: 'Show-day reminders failed' });
  }
}
