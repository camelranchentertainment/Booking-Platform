import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '../../../../lib/supabase';

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL       ?? 'https://placeholder.supabase.co';
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  ?? 'placeholder-anon-key';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // User-scoped client: all queries run under RLS, booking_personnel SELECT
  // policy filters to rows where act_personnel.linked_user_id = auth.uid()
  const userClient = createClient(SB_URL, SB_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await userClient
    .from('booking_personnel')
    .select(`
      id,
      personnel_id,
      status,
      notes,
      responded_at,
      bookings!booking_personnel_booking_id_fkey(
        id,
        show_date,
        status,
        load_in_time,
        set_time,
        door_time,
        soundcheck_time,
        venues!bookings_venue_id_fkey(
          name,
          address,
          city,
          state
        )
      ),
      act_personnel!booking_personnel_personnel_id_fkey(
        default_pay_amount
      )
    `);

  if (error) return res.status(500).json({ error: error.message });

  const typedRows = (rows ?? []) as any[];

  // expenses RLS is scoped to user_id (the band admin who wrote the row),
  // so the member cannot read it via userClient — use service client with
  // explicit booking_id + personnel_id scope instead.
  const bookingIds   = typedRows.map(r => r.bookings?.id).filter(Boolean);
  const personnelIds = [...new Set(typedRows.map(r => r.personnel_id).filter(Boolean))];

  const expenseMap = new Map<string, number>();
  if (bookingIds.length > 0 && personnelIds.length > 0) {
    const { data: expenses } = await service
      .from('expenses')
      .select('booking_id, personnel_id, amount')
      .in('booking_id', bookingIds)
      .in('personnel_id', personnelIds as string[])
      .eq('category', 'band_pay');

    for (const e of (expenses ?? [])) {
      expenseMap.set(`${e.booking_id}:${e.personnel_id}`, Number(e.amount));
    }
  }

  const shows = typedRows
    .map(r => {
      const booking   = r.bookings  as any;
      const personnel = r.act_personnel as any;
      const venue     = booking?.venues ?? null;
      const bookingId = booking?.id    ?? null;

      const expenseAmount = expenseMap.get(`${bookingId}:${r.personnel_id}`);
      const defaultPay    = personnel?.default_pay_amount != null
        ? Number(personnel.default_pay_amount)
        : null;

      let pay: { amount: number; source: 'confirmed' | 'estimated' } | null = null;
      if (expenseAmount !== undefined) {
        pay = { amount: expenseAmount, source: 'confirmed' };
      } else if (defaultPay !== null) {
        pay = { amount: defaultPay, source: 'estimated' };
      }

      return {
        id:              r.id              as string,
        booking_id:      bookingId         as string | null,
        status:          r.status          as string,
        notes:           r.notes           as string | null ?? null,
        responded_at:    r.responded_at    as string | null ?? null,
        show_date:       booking?.show_date        ?? null,
        booking_status:  booking?.status           ?? null,
        load_in_time:    booking?.load_in_time     ?? null,
        set_time:        booking?.set_time         ?? null,
        door_time:       booking?.door_time        ?? null,
        soundcheck_time: booking?.soundcheck_time  ?? null,
        venue: venue
          ? { name: venue.name ?? null, address: venue.address ?? null,
              city: venue.city ?? null, state: venue.state ?? null }
          : null,
        pay,
      };
    })
    .sort((a, b) => {
      if (!a.show_date && !b.show_date) return 0;
      if (!a.show_date) return 1;
      if (!b.show_date) return -1;
      return a.show_date < b.show_date ? -1 : a.show_date > b.show_date ? 1 : 0;
    });

  return res.status(200).json({ shows });
}
