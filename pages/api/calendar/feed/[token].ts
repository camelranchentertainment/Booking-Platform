import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getServiceClient } from '../../../../lib/supabase';
import { buildIcal } from '../../../../lib/ical';

const TokenSchema = z.string().regex(/^[0-9a-f]{64}$/, 'Invalid token');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  // Calendar apps append .ics to the URL; strip it so the token validates cleanly.
  const raw = (req.query.token as string ?? '').replace(/\.ics$/, '');
  const parse = TokenSchema.safeParse(raw);
  if (!parse.success) return res.status(404).end();

  const service = getServiceClient();

  const { data: act } = await service
    .from('acts')
    .select('id, act_name')
    .eq('ical_feed_token', parse.data)
    .maybeSingle();

  // Always 404 — don't reveal whether a token exists
  if (!act) return res.status(404).end();

  const { data: bookings } = await service
    .from('bookings')
    .select(`
      id,
      show_date,
      status,
      set_time,
      load_in_time,
      venue:venues(name, city, state, address)
    `)
    .eq('act_id', act.id)
    .neq('status', 'cancelled')
    .not('show_date', 'is', null)
    .order('show_date');

  const shows = (bookings || []).map((b: any) => ({ ...b, act_id: act.id }));
  const calName = act.act_name ? `${act.act_name} Shows` : 'Shows';
  const ical = buildIcal(shows, calName);

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="camelranch-shows.ics"');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.status(200).send(ical);
}
