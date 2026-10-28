// lib/server/analytics.ts
//
// Everything the Analytics page shows, computed for one band and one calendar
// year. Used by GET /api/analytics and by the AI recommendations route, which
// works from these server-computed figures instead of numbers a client sends.
//
// Callers must have already checked the caller is a band admin: these figures
// include money, and members never see money.

import type { SupabaseClient } from '@supabase/supabase-js';
import { availableBookingYears, bookingsInYear } from '../analyticsYear';
import {
  buildFunnel, emailByWeek, pct, showsByMonth, showsByState, topVenues,
  type AnalyticsBooking, type AnalyticsEmail, type AnalyticsTourVenue,
  type FunnelStep, type MonthShows, type StateShows, type TopVenue, type WeekActivity,
} from '../domain/analytics';

export interface AnalyticsReport {
  year: number;
  pipeline: { target: number; follow_up: number; confirmed: number; declined: number; thank_you: number; total: number };
  funnel: FunnelStep[];
  /** Booked ÷ pipeline (tour targets), from the funnel. */
  conversionRate: number;
  /** Venues that wrote back ÷ venues emailed (all time). */
  responseRate: number;
  regionalPerformance: Array<{ state: string; total: number; confirmed: number; responded: number; conversionRate: number; responseRate: number }>;
  emailPerformance: { sent: number; received: number; venuesEmailed: number; venuesReplied: number; responseRate: number; weeks: WeekActivity[] };
  bookingFinancials: {
    year: number;
    availableYears: number[];
    totalConfirmed: number;
    futureConfirmedCount: number;
    totalCompleted: number;
    totalEarned: number;
    totalPotential: number;
    avgPay: number;
    dealTypeBreakdown: Record<string, number>;
    wouldReturnPct: number | null;
  };
  months: MonthShows[];
  states: StateShows[];
  topVenues: TopVenue[];
  tourStats: Array<{ id: string; name: string | null; status: string; total: number; contacted: number; confirmed: number; conversionRate: number }>;
  generatedAt: string;
}

/** Loads and computes the analytics report for `actId` and `year`. */
export async function computeAnalytics(
  service: SupabaseClient,
  actId: string,
  year: number,
  now: Date = new Date(),
): Promise<AnalyticsReport> {
  const { data: toursData, error: toursErr } = await service
    .from('tours')
    .select('id, name, status, created_at')
    .eq('act_id', actId)
    .order('created_at', { ascending: false });
  if (toursErr) throw new Error(`tours: ${toursErr.message}`);
  const tours = (toursData ?? []) as Array<{ id: string; name: string | null; status: string }>;
  const tourIds = tours.map(t => t.id);

  const [tvRes, bookingsRes, emailRes] = await Promise.all([
    tourIds.length > 0
      ? service
          .from('tour_venues')
          .select('id, status, last_contacted_at, pitched_at, tour_id, venue_id, venue:venues(city, state)')
          .in('tour_id', tourIds)
      : Promise.resolve({ data: [], error: null }),
    service
      .from('bookings')
      .select('show_date, agreed_amount, actual_amount_received, deal_type, rebook_flag, status, venue_id, tour_id, venue:venues(name, city, state)')
      .eq('act_id', actId)
      .order('show_date', { ascending: false }),
    service
      .from('email_log')
      .select('sent_at, status, direction, venue_id')
      .eq('act_id', actId)
      .neq('status', 'failed'),
  ]);
  if (tvRes.error) throw new Error(`tour_venues: ${tvRes.error.message}`);
  if (bookingsRes.error) throw new Error(`bookings: ${bookingsRes.error.message}`);
  if (emailRes.error) throw new Error(`email_log: ${emailRes.error.message}`);

  type TV = AnalyticsTourVenue & { venue: { city: string | null; state: string | null } | null };
  type B = AnalyticsBooking & { deal_type: string | null; rebook_flag: string | null };
  const tourVenues = (tvRes.data ?? []) as unknown as TV[];
  const bookings = (bookingsRes.data ?? []) as unknown as B[];
  const emails = (emailRes.data ?? []) as unknown as Array<AnalyticsEmail & { status: string }>;

  // ── Pipeline & funnel ──
  const count = (s: string) => tourVenues.filter(v => v.status === s).length;
  const pipeline = {
    target: count('target'),
    follow_up: count('follow_up'),
    confirmed: count('confirmed'),
    declined: count('declined'),
    thank_you: count('thank_you'),
    total: tourVenues.length,
  };

  const sentVenueIds = new Set(emails.filter(e => e.direction !== 'received' && e.venue_id).map(e => e.venue_id as string));
  const repliedVenueIds = new Set(emails.filter(e => e.direction === 'received' && e.venue_id).map(e => e.venue_id as string));
  const venuesReplied = [...repliedVenueIds].filter(id => sentVenueIds.has(id)).length;
  const responseRate = pct(venuesReplied, sentVenueIds.size);

  const funnel = buildFunnel(tourVenues, repliedVenueIds, bookings);
  const conversionRate = funnel[funnel.length - 1].ofTotal;

  // ── Pipeline by state ──
  const regionMap: Record<string, { state: string; total: number; confirmed: number; responded: number }> = {};
  for (const v of tourVenues) {
    const state = v.venue?.state ?? 'Unknown';
    regionMap[state] ??= { state, total: 0, confirmed: 0, responded: 0 };
    regionMap[state].total++;
    if (['confirmed', 'thank_you'].includes(v.status)) regionMap[state].confirmed++;
    if (v.venue_id && repliedVenueIds.has(v.venue_id)) regionMap[state].responded++;
  }
  const regionalPerformance = Object.values(regionMap)
    .sort((a, b) => b.total - a.total)
    .map(r => ({ ...r, conversionRate: pct(r.confirmed, r.total), responseRate: pct(r.responded, r.total) }));

  // ── Email ──
  const emailPerformance = {
    sent: emails.filter(e => e.direction !== 'received').length,
    received: emails.filter(e => e.direction === 'received').length,
    venuesEmailed: sentVenueIds.size,
    venuesReplied,
    responseRate,
    weeks: emailByWeek(emails, now, 12),
  };

  // ── Money, one calendar year at a time ──
  const yearBookings = bookingsInYear(bookings, year);
  const confirmedBookings = yearBookings.filter(b => ['confirmed', 'completed'].includes(b.status));
  const completedBookings = yearBookings.filter(b => b.status === 'completed');
  // Earned = actual_amount_received on completed shows only.
  const totalEarned = completedBookings.reduce((sum, b) => sum + (Number(b.actual_amount_received) || 0), 0);
  // Potential = agreed_amount on confirmed future shows only.
  const today = now.toISOString().slice(0, 10);
  const futureConfirmed = confirmedBookings.filter(b => b.status === 'confirmed' && b.show_date != null && b.show_date > today);
  const totalPotential = futureConfirmed.reduce((sum, b) => sum + (Number(b.agreed_amount) || 0), 0);
  const paid = completedBookings.filter(b => Number(b.actual_amount_received) > 0);
  const avgPay = paid.length > 0 ? Math.round(totalEarned / paid.length) : 0;

  const dealTypeBreakdown: Record<string, number> = {};
  for (const b of confirmedBookings) {
    const type = b.deal_type ?? 'unspecified';
    dealTypeBreakdown[type] = (dealTypeBreakdown[type] ?? 0) + 1;
  }
  const rebookYes = confirmedBookings.filter(b => b.rebook_flag === 'yes').length;
  const rebookTotal = confirmedBookings.filter(b => b.rebook_flag != null).length;

  const bookingFinancials = {
    year,
    availableYears: availableBookingYears(bookings, now.getFullYear()),
    totalConfirmed: confirmedBookings.length,
    futureConfirmedCount: futureConfirmed.length,
    totalCompleted: completedBookings.length,
    totalEarned,
    totalPotential,
    avgPay,
    dealTypeBreakdown,
    wouldReturnPct: rebookTotal > 0 ? pct(rebookYes, rebookTotal) : null,
  };

  // ── Tours ──
  const bookedFunnelByTour = new Map<string, number>();
  const bookedKeys = new Set(
    bookings.filter(b => ['contract', 'confirmed', 'advancing', 'completed'].includes(b.status) && b.venue_id && b.tour_id)
      .map(b => `${b.tour_id}:${b.venue_id}`),
  );
  for (const v of tourVenues) {
    const booked = ['confirmed', 'thank_you'].includes(v.status) || (v.venue_id != null && bookedKeys.has(`${v.tour_id}:${v.venue_id}`));
    if (booked) bookedFunnelByTour.set(v.tour_id, (bookedFunnelByTour.get(v.tour_id) ?? 0) + 1);
  }
  const tourStats = tours.map(t => {
    const tvs = tourVenues.filter(v => v.tour_id === t.id);
    const confirmed = bookedFunnelByTour.get(t.id) ?? 0;
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      total: tvs.length,
      contacted: tvs.filter(v => v.last_contacted_at != null || v.pitched_at != null).length,
      confirmed,
      conversionRate: pct(confirmed, tvs.length),
    };
  });

  return {
    year,
    pipeline,
    funnel,
    conversionRate,
    responseRate,
    regionalPerformance,
    emailPerformance,
    bookingFinancials,
    months: showsByMonth(bookings, year),
    states: showsByState(bookings, year),
    topVenues: topVenues(bookings, year, 5),
    tourStats,
    generatedAt: now.toISOString(),
  };
}
