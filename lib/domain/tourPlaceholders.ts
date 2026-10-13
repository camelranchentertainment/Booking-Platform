// lib/domain/tourPlaceholders.ts
//
// Builds the calendar's "working on it" placeholders for open tour dates.
//
// A tour target is not a show. Instead of one calendar entry per targeted
// venue, each still-open night of a tour gets ONE placeholder tile that says
// how many venues are being worked for that night. The targets themselves stay
// on the tour (tour_venues); the placeholder is computed, never stored.
//
// Rules (agreed with Scott, Oct 12 2026):
//   - One placeholder per tour per date, for every date from start to end.
//   - A target counts toward a date when it is pinned to that date
//     (tour_venues.booking_date) or not pinned to any date yet.
//   - Only open targets count: status "target" or "follow_up".
//   - A night that already has a booked show for the band (confirmed or
//     further along) gets no placeholder: the band can't play two places.
//   - Finished/cancelled tours and nights before today get none.
//   - Band Admins only: the page that renders these is admin-only, and the
//     member calendar does not use this.

import { BOOKED_SHOW_STATUSES } from '../types';

export const OPEN_TARGET_STATUSES = ['target', 'follow_up'] as const;
export type OpenTargetStatus = (typeof OPEN_TARGET_STATUSES)[number];

/** Upper bound on nights per tour, so a bad end date can't flood the calendar. */
export const MAX_TOUR_NIGHTS = 62;

export interface PlaceholderTour {
  id: string;
  name: string | null;
  start_date: string | null; // YYYY-MM-DD
  end_date: string | null;   // YYYY-MM-DD
  status: string | null;
}

export interface PlaceholderTarget {
  id: string;
  tour_id: string;
  status: string;
  booking_date: string | null; // YYYY-MM-DD
  last_contacted_at?: string | null;
  venue: { id: string; name: string | null; city: string | null; state: string | null } | null;
}

export interface PlaceholderShow {
  show_date: string | null;
  status: string | null;
}

export interface TourPlaceholder {
  tourId: string;
  tourName: string;
  date: string;
  /** Open targets that apply to this night, sorted by venue name. */
  targets: PlaceholderTarget[];
}

/** Every YYYY-MM-DD from start to end inclusive (UTC date math; no time zones involved). */
export function datesInRange(start: string, end: string, max = MAX_TOUR_NIGHTS): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime()) || cur > last) return out;
  while (cur <= last && out.length < max) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

const isOpen = (status: string): status is OpenTargetStatus =>
  (OPEN_TARGET_STATUSES as readonly string[]).includes(status);

const byVenueName = (a: PlaceholderTarget, b: PlaceholderTarget) =>
  (a.venue?.name ?? '').localeCompare(b.venue?.name ?? '');

/**
 * Placeholders keyed by date (YYYY-MM-DD). A date can hold more than one when
 * two tours overlap.
 *
 * @param today YYYY-MM-DD; nights before it are skipped
 */
export function buildTourPlaceholders(
  tours: PlaceholderTour[],
  targets: PlaceholderTarget[],
  shows: PlaceholderShow[],
  today: string,
): Record<string, TourPlaceholder[]> {
  const bookedNights = new Set(
    shows
      .filter(s => s.show_date && s.status && (BOOKED_SHOW_STATUSES as readonly string[]).includes(s.status))
      .map(s => (s.show_date as string).slice(0, 10)),
  );

  const targetsByTour = new Map<string, PlaceholderTarget[]>();
  for (const t of targets) {
    if (!isOpen(t.status)) continue;
    const list = targetsByTour.get(t.tour_id) ?? [];
    list.push(t);
    targetsByTour.set(t.tour_id, list);
  }

  const out: Record<string, TourPlaceholder[]> = {};
  for (const tour of tours) {
    if (tour.status === 'completed' || tour.status === 'cancelled') continue;
    const start = tour.start_date ?? tour.end_date;
    const end = tour.end_date ?? tour.start_date;
    if (!start || !end) continue;

    const open = targetsByTour.get(tour.id) ?? [];
    for (const date of datesInRange(start, end)) {
      if (date < today || bookedNights.has(date)) continue;
      const forNight = open.filter(t => !t.booking_date || t.booking_date.slice(0, 10) === date).sort(byVenueName);
      (out[date] ??= []).push({
        tourId: tour.id,
        tourName: tour.name?.trim() || 'Tour',
        date,
        targets: forNight,
      });
    }
  }
  return out;
}
