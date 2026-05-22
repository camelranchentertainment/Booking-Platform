import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { buildIcal } from '../../../lib/ical';

/**
 * Public .ics subscribe feed — no auth required.
 * URL: /api/calendar/{actId}.ics
 * Calendar apps hit this URL on a schedule to keep shows in sync.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const actId = req.query.actId as string;
  if (!actId) return res.status(400).end();

  const service = getServiceClient();

  // Verify the act exists
  const { data: act } = await service
    .from('acts')
    .select('act_name')
    .eq('id', actId)
    .maybeSingle();

  if (!act) return res.status(404).end();

  // Fetch all non-cancelled bookings that have a show date
  const { data: bookings } = await service
    .from('bookings')
    .select(`
      id,
      show_date,
      status,
      set_time,
      load_in_time,
      fee,
      notes,
      venue:venues(name, city, state),
      tour:tours(name)
    `)
    .eq('act_id', actId)
    .neq('status', 'cancelled')
    .not('show_date', 'is', null)
    .order('show_date');

  // Shape rows so buildIcal can consume them
  const shows = (bookings || []).map((b: any) => ({
    ...b,
    act_id: actId,
    // Add tour name to description if present
    notes: [b.notes, b.tour?.name ? `Tour: ${b.tour.name}` : ''].filter(Boolean).join(' | ') || null,
  }));

  const calName = act.act_name ? `${act.act_name} Shows` : 'Shows';
  const ical = buildIcal(shows, calName);

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="camelranch-shows.ics"');
  // No caching — calendar apps need fresh data every poll
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.status(200).send(ical);
}
