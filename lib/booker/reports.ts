// lib/booker/reports.ts
// Reports for the Booking Agent workspace (build list item 5). Pure functions,
// no I/O, unit-tested.
//
//   reportRows   a calendar year's shows grouped by band, town, venue or
//                talent buyer: played, still to come, gross and commission
//   bookBacks    venues that have booked the agent's bands more than once
//   toCsv        a spreadsheet-safe CSV of any rows
//
// Money follows the platform rules: earned = played shows only (actual amount
// received when entered, else the agreed fee); still to come = confirmed shows
// dated today or later. Totals are scoped to one calendar year.

import { commissionDue, commissionProjected, roundCents, toAmount } from './commission';
import type { BookerOffer } from './offers';
import type { BookerShow, BookerVenue, RosterBand } from './types';

export const REPORT_GROUPS = ['band', 'city', 'venue', 'buyer'] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];
export const REPORT_GROUP_LABEL: Record<ReportGroup, string> = { band: 'By band', city: 'By town', venue: 'By venue', buyer: 'By talent buyer' };

export interface ReportRow {
  key: string;
  label: string;
  /** Played shows in the year */
  played: number;
  /** Confirmed shows still to come in the year */
  upcoming: number;
  /** Earned gross: played shows' actual amount, else agreed fee */
  gross: number;
  /** Agreed fees on confirmed shows still to come */
  upcomingGross: number;
  /** Commission earned on played shows */
  commission: number;
  /** Commission projected from confirmed shows still to come */
  projectedCommission: number;
  /** Most recent played date in the year, or null */
  lastPlayed: string | null;
}

type ReportShow = Pick<
  BookerShow,
  'id' | 'roster_id' | 'venue_id' | 'venue_name' | 'venue_city' | 'show_date' | 'status' | 'fee' | 'actual_amount' | 'commission_pct_override' | 'deleted_at'
>;

const NONE = { band: 'Unknown band', city: 'Town not set', venue: 'Venue not set', buyer: 'No buyer recorded' } as const;

/** Where a show is, as a stable key and a label. Saved venues by id; typed ones by name. */
function venueOf(s: ReportShow, venuesById: ReadonlyMap<string, Pick<BookerVenue, 'name' | 'city' | 'state'>>): { key: string; label: string } {
  if (s.venue_id) {
    const v = venuesById.get(s.venue_id);
    return { key: `id:${s.venue_id}`, label: v ? `${v.name}${v.city ? `, ${v.city}` : ''}` : NONE.venue };
  }
  const name = s.venue_name?.trim();
  return name ? { key: `name:${name.toLowerCase()}`, label: `${name}${s.venue_city ? `, ${s.venue_city}` : ''}` } : { key: 'none', label: NONE.venue };
}

function townOf(s: ReportShow, venuesById: ReadonlyMap<string, Pick<BookerVenue, 'name' | 'city' | 'state'>>): { key: string; label: string } {
  const v = s.venue_id ? venuesById.get(s.venue_id) : undefined;
  const city = (v?.city ?? s.venue_city)?.trim();
  if (!city) return { key: 'none', label: NONE.city };
  const label = [city, v?.state?.trim()].filter(Boolean).join(', ');
  return { key: label.toLowerCase(), label };
}

/** The talent buyer on the show's latest accepted offer, else its latest sent offer. */
export function buyerByShow(offers: readonly Pick<BookerOffer, 'show_id' | 'status' | 'buyer_name' | 'created_at' | 'deleted_at'>[]): Map<string, string> {
  const rank = (st: string) => (st === 'accepted' ? 2 : st === 'sent' || st === 'declined' ? 1 : 0);
  const best = new Map<string, { name: string; rank: number; at: string }>();
  for (const o of offers) {
    const name = o.buyer_name?.trim();
    if (o.deleted_at || !name) continue;
    const r = rank(o.status);
    if (r === 0) continue;
    const prev = best.get(o.show_id);
    if (!prev || r > prev.rank || (r === prev.rank && o.created_at > prev.at)) best.set(o.show_id, { name, rank: r, at: o.created_at });
  }
  return new Map([...best].map(([k, v]) => [k, v.name]));
}

/**
 * One calendar year's shows grouped for a report, biggest earned gross first.
 * Cancelled, hold and pending shows are left out: reports are about shows
 * that happened or are confirmed.
 */
export function reportRows(args: {
  shows: readonly ReportShow[];
  bands: readonly Pick<RosterBand, 'id' | 'band_name' | 'commission_pct' | 'repeat_commission_pct'>[];
  venuesById: ReadonlyMap<string, Pick<BookerVenue, 'name' | 'city' | 'state'>>;
  buyers: ReadonlyMap<string, string>;
  group: ReportGroup;
  year: number;
  today: string;
  repeats?: ReadonlySet<string>;
}): ReportRow[] {
  const { shows, bands, venuesById, buyers, group, year, today } = args;
  const repeats = args.repeats ?? new Set<string>();
  const bandsById = new Map(bands.map(b => [b.id, b]));
  const rows = new Map<string, ReportRow & { _gross: number; _upGross: number; _comm: number; _proj: number }>();
  const prefix = String(year);

  for (const s of shows) {
    if (s.deleted_at || !s.show_date.startsWith(prefix)) continue;
    const isPlayed = s.status === 'played';
    const isUpcoming = s.status === 'confirmed' && s.show_date >= today;
    if (!isPlayed && !isUpcoming) continue;

    let key: string;
    let label: string;
    if (group === 'band') {
      key = s.roster_id;
      label = bandsById.get(s.roster_id)?.band_name ?? NONE.band;
    } else if (group === 'city') {
      ({ key, label } = townOf(s, venuesById));
    } else if (group === 'venue') {
      ({ key, label } = venueOf(s, venuesById));
    } else {
      const buyer = buyers.get(s.id);
      key = buyer ? buyer.toLowerCase() : 'none';
      label = buyer ?? NONE.buyer;
    }

    const row = rows.get(key) ?? { key, label, played: 0, upcoming: 0, gross: 0, upcomingGross: 0, commission: 0, projectedCommission: 0, lastPlayed: null, _gross: 0, _upGross: 0, _comm: 0, _proj: 0 };
    const band = bandsById.get(s.roster_id);
    const repeat = repeats.has(s.id);
    if (isPlayed) {
      row.played += 1;
      row._gross += Math.round((toAmount(s.actual_amount) ?? toAmount(s.fee) ?? 0) * 100);
      row._comm += Math.round(commissionDue(s, band, repeat) * 100);
      if (!row.lastPlayed || s.show_date > row.lastPlayed) row.lastPlayed = s.show_date;
    } else {
      row.upcoming += 1;
      row._upGross += Math.round((toAmount(s.fee) ?? 0) * 100);
      row._proj += Math.round(commissionProjected(s, band, today, repeat) * 100);
    }
    rows.set(key, row);
  }

  return [...rows.values()]
    .map(({ _gross, _upGross, _comm, _proj, ...r }) => ({ ...r, gross: _gross / 100, upcomingGross: _upGross / 100, commission: _comm / 100, projectedCommission: _proj / 100 }))
    .sort((a, b) => b.gross - a.gross || b.upcomingGross - a.upcomingGross || a.label.localeCompare(b.label));
}

/** Sums a report's rows for the totals line. */
export function reportTotals(rows: readonly ReportRow[]): Omit<ReportRow, 'key' | 'label' | 'lastPlayed'> {
  const sum = (f: (r: ReportRow) => number) => roundCents(rows.reduce((t, r) => t + f(r), 0));
  return {
    played: rows.reduce((t, r) => t + r.played, 0),
    upcoming: rows.reduce((t, r) => t + r.upcoming, 0),
    gross: sum(r => r.gross),
    upcomingGross: sum(r => r.upcomingGross),
    commission: sum(r => r.commission),
    projectedCommission: sum(r => r.projectedCommission),
  };
}

export interface BookBack {
  key: string;
  venueId: string | null;
  label: string;
  /** Played shows there, all years */
  timesPlayed: number;
  /** Different bands of the agent's that have played there */
  bands: number;
  /** Different calendar years with a played show */
  years: number;
  firstPlayed: string;
  lastPlayed: string;
  /** Average earned gross per played show, or null when no amounts recorded */
  averageGross: number | null;
  /** A confirmed or held date still to come there */
  nextDate: string | null;
}

/**
 * Venues that book the agent's bands back: two or more played shows across
 * all years, most played first.
 */
export function bookBacks(shows: readonly ReportShow[], venuesById: ReadonlyMap<string, Pick<BookerVenue, 'name' | 'city' | 'state'>>, today: string): BookBack[] {
  const groups = new Map<string, { label: string; venueId: string | null; played: ReportShow[]; next: string | null }>();
  for (const s of shows) {
    if (s.deleted_at || s.status === 'cancelled') continue;
    const { key, label } = venueOf(s, venuesById);
    if (key === 'none') continue;
    const g = groups.get(key) ?? { label, venueId: s.venue_id, played: [], next: null };
    if (s.status === 'played') g.played.push(s);
    else if (s.show_date >= today && (s.status === 'confirmed' || s.status === 'hold' || s.status === 'pending')) {
      if (!g.next || s.show_date < g.next) g.next = s.show_date;
    }
    groups.set(key, g);
  }
  const out: BookBack[] = [];
  for (const [key, g] of groups) {
    if (g.played.length < 2) continue;
    const dates = g.played.map(s => s.show_date).sort();
    const amounts = g.played.map(s => toAmount(s.actual_amount) ?? toAmount(s.fee)).filter((x): x is number => x !== null);
    out.push({
      key,
      venueId: g.venueId,
      label: g.label,
      timesPlayed: g.played.length,
      bands: new Set(g.played.map(s => s.roster_id)).size,
      years: new Set(dates.map(d => d.slice(0, 4))).size,
      firstPlayed: dates[0],
      lastPlayed: dates[dates.length - 1],
      averageGross: amounts.length ? roundCents(amounts.reduce((a, b) => a + b, 0) / amounts.length) : null,
      nextDate: g.next,
    });
  }
  return out.sort((a, b) => b.timesPlayed - a.timesPlayed || b.lastPlayed.localeCompare(a.lastPlayed));
}

/**
 * One CSV cell: quoted when needed, and a leading = + - @ (or tab / CR) is
 * prefixed with an apostrophe so a spreadsheet never runs it as a formula.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text (CRLF line endings, header first). */
export function toCsv(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}
