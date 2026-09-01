import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await service
    .from('profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.act_id) return res.status(400).json({ error: 'No act associated with account' });

  const actId = profile.act_id;

  // Fetch all tour IDs for this act upfront (needed for tour_venues scoping)
  const { data: toursData } = await service
    .from('tours')
    .select('id, name, status, created_at')
    .eq('act_id', actId)
    .order('created_at', { ascending: false });

  const tours = toursData ?? [];
  const tourIds = tours.map((t: any) => t.id);

  const [tourVenuesRes, bookingsRes, emailLogRes] = await Promise.all([
    tourIds.length > 0
      ? service
          .from('tour_venues')
          .select('id, status, last_contacted_at, tour_id, venue_id, venue:venues(city, state)')
          .in('tour_id', tourIds)
      : Promise.resolve({ data: [] }),

    service
      .from('bookings')
      .select('show_date, agreed_amount, actual_amount_received, deal_type, rebook_flag, status, venue_id, venue:venues(city, state)')
      .eq('act_id', actId)
      .order('show_date', { ascending: false }),

    service
      .from('email_log')
      .select('id, sent_at, status, direction, venue_id, tour_venue_id, act_id')
      .eq('act_id', actId)
      .neq('status', 'failed'),
  ]);

  const tourVenues = (tourVenuesRes.data ?? []) as any[];
  const bookings   = (bookingsRes.data   ?? []) as any[];
  const emailLogs  = (emailLogRes.data   ?? []) as any[];

  // ── Pipeline funnel ──────────────────────────────────────────────────────
  const pipeline = {
  target:    tourVenues.filter(v => v.status === 'target').length,
  follow_up: tourVenues.filter(v => v.status === 'follow_up').length,
  confirmed: tourVenues.filter(v => v.status === 'confirmed').length,
  declined:  tourVenues.filter(v => v.status === 'declined').length,
  thank_you: tourVenues.filter(v => v.status === 'thank_you').length,
  total:     tourVenues.length,
};

// Confirmed + Thank You both represent successful conversions.
const convertedCount = pipeline.confirmed + pipeline.thank_you;

const conversionRate = pipeline.total > 0
  ? Math.round((convertedCount / pipeline.total) * 100)
  : 0;

// Response rate is based on actual email activity rather than manual status.
const sentVenueIds = new Set(
  emailLogs
    .filter(e => e.direction !== 'received' && e.venue_id)
    .map(e => e.venue_id)
);

const repliedVenueIds = new Set(
  emailLogs
    .filter(e => e.direction === 'received' && e.venue_id)
    .map(e => e.venue_id)
);

const responseRate = sentVenueIds.size > 0
  ? Math.round(
      ([...repliedVenueIds].filter(id => sentVenueIds.has(id)).length / sentVenueIds.size) * 100
    )
  : 0;

  // ── Regional performance ─────────────────────────────────────────────────
  const regionMap: Record<string, { state: string; total: number; confirmed: number; responded: number }> = {};
  for (const v of tourVenues) {
    const state = (v.venue as any)?.state ?? 'Unknown';
    if (!regionMap[state]) regionMap[state] = { state, total: 0, confirmed: 0, responded: 0 };
    regionMap[state].total++;
    if (['confirmed', 'thank_you'].includes(v.status)) {
  regionMap[state].confirmed++;
}

if (v.venue_id && repliedVenueIds.has(v.venue_id)) {
  regionMap[state].responded++;
}
  }
  const regionalPerformance = Object.values(regionMap)
    .sort((a, b) => b.confirmed - a.confirmed)
    .map(r => ({
      ...r,
      conversionRate: r.total > 0 ? Math.round((r.confirmed / r.total) * 100) : 0,
      responseRate:   r.total > 0 ? Math.round((r.responded / r.total) * 100) : 0,
    }));

  // ── Email performance ────────────────────────────────────────────────────
  const sentEmails = emailLogs.filter(e => e.direction !== 'received');

const emailsSent = sentEmails.length;
const emailsDelivered = sentEmails.filter(
  e => e.status === 'delivered'
).length;

  const emailPerformance = {
    sent:          emailsSent,
    deliveryRate:  emailsSent > 0 ? Math.round((emailsDelivered / emailsSent) * 100) : 0,
    // Response rate derived from pipeline (venues that replied vs total reached)
    responseRate:  responseRate,
  };

  // ── Booking financials ───────────────────────────────────────────────────
  const confirmedBookings = bookings.filter((b: any) =>
    ['confirmed', 'completed'].includes(b.status)
  );
  const completedBookings = bookings.filter((b: any) => b.status === 'completed');

  // Earned = actual_amount_received on completed shows only
  const totalEarned = completedBookings.reduce(
    (sum: number, b: any) => sum + (b.actual_amount_received ?? 0), 0
  );
  // Potential = agreed_amount on confirmed future shows
  const today = new Date().toISOString().split('T')[0];
  const futureConfirmed = confirmedBookings.filter(
    (b: any) => b.status === 'confirmed' && b.show_date && b.show_date > today
  );
  const totalPotential = futureConfirmed.reduce(
    (sum: number, b: any) => sum + (b.agreed_amount ?? 0), 0
  );

  const avgPay = completedBookings.filter((b: any) => b.actual_amount_received).length > 0
    ? Math.round(totalEarned / completedBookings.filter((b: any) => b.actual_amount_received).length)
    : 0;

  const dealTypeBreakdown: Record<string, number> = {};
  for (const b of confirmedBookings) {
    const type = (b as any).deal_type ?? 'unspecified';
    dealTypeBreakdown[type] = (dealTypeBreakdown[type] ?? 0) + 1;
  }

  // Rebook flag breakdown
  const rebookYes = confirmedBookings.filter((b: any) => b.rebook_flag === 'yes').length;
  const rebookTotal = confirmedBookings.filter((b: any) => b.rebook_flag !== null).length;
  const wouldReturnPct = rebookTotal > 0 ? Math.round((rebookYes / rebookTotal) * 100) : null;

  const bookingFinancials = {
    totalConfirmed:       confirmedBookings.length,
    futureConfirmedCount: futureConfirmed.length,
    totalCompleted:       completedBookings.length,
    totalEarned,
    totalPotential,
    avgPay,
    dealTypeBreakdown,
    wouldReturnPct,
  };

  // ── Tour comparison ──────────────────────────────────────────────────────
  const tourStats = tours.map((t: any) => {
    const tvs       = tourVenues.filter((v: any) => v.tour_id === t.id);
    const confirmed = tvs.filter((v: any) =>
  ['confirmed', 'thank_you'].includes(v.status)
).length;

const contacted = tvs.filter((v: any) =>
  v.last_contacted_at != null
).length;
    return {
      id:             t.id,
      name:           t.name,
      status:         t.status,
      total:          tvs.length,
      contacted,
      confirmed,
      conversionRate: tvs.length > 0 ? Math.round((confirmed / tvs.length) * 100) : 0,
    };
  });

  return res.status(200).json({
    pipeline,
    conversionRate,
    responseRate,
    regionalPerformance,
    emailPerformance,
    bookingFinancials,
    tourStats,
    generatedAt: new Date().toISOString(),
  });
}
