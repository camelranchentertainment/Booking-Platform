// lib/domain/calendarView.ts
//
// Pure helpers behind the band Calendar page (pages/calendar.tsx): the month
// grid, the week strip, the status legend (derived from the same colours the
// tiles use, so the two can never disagree), readable text on a status
// colour, and the numbers in the page's metric trackers. No React, no
// Supabase — unit-tested in __tests__/lib/domain/calendarView.test.ts.

import { BOOKED_SHOW_STATUSES, BOOKING_STATUS_LABELS, type BookingStatus } from '../types';
import { STATUS_COLORS } from '../statusSync';
import { parseLocalDate } from '../formatDate';

/** Local calendar day as YYYY-MM-DD (no UTC day-shift). */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface GridCell {
  date: string;
  day: number;
  /** false for the leading/trailing days borrowed from the neighbouring months. */
  inMonth: boolean;
}

/**
 * Full weeks (Sunday first) covering a month, including the neighbouring
 * months' days that fill the first and last rows. Always 5 or 6 rows.
 *
 * @param year  Four-digit year.
 * @param month 0-based month (0 = January).
 */
export function monthGrid(year: number, month: number): GridCell[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const used = first.getDay() + daysInMonth;
  const total = Math.ceil(used / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date: toDateStr(d), day: d.getDate(), inMonth: d.getMonth() === month };
  });
}

/** The seven days (Sunday first) of the week `offset` weeks from the week containing `anchor`. */
export function weekDays(anchor: Date, offset: number): Date[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const FALLBACK_COLOR = '#64748b';

/** Tile colour for a booking status (the same table the outreach pages use). */
export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? FALLBACK_COLOR;
}

/**
 * Dark or light text for a coloured tile, by WCAG relative luminance. The old
 * calendar put white text on every tile, which is unreadable on yellow.
 */
export function inkOn(hex: string): '#0b1220' | '#ffffff' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  // Contrast against white vs. near-black; pick whichever is higher.
  const vsWhite = 1.05 / (lum + 0.05);
  const vsDark = (lum + 0.05) / 0.056; // #0b1220 luminance ≈ 0.006
  return vsDark >= vsWhite ? '#0b1220' : '#ffffff';
}

export interface LegendEntry { color: string; label: string }

/** Statuses shown on the calendar, in pipeline order. */
const LEGEND_ORDER: readonly BookingStatus[] = ['pitch', 'negotiation', 'hold', 'contract', 'confirmed', 'advancing', 'completed'];

/**
 * Legend chips built from STATUS_COLORS. Statuses that share a colour are
 * merged into one chip ("Negotiation / Hold") so the legend never claims a
 * difference the tiles don't show.
 */
export function statusLegend(): LegendEntry[] {
  const byColor = new Map<string, string[]>();
  for (const s of LEGEND_ORDER) {
    const c = statusColor(s).toLowerCase();
    const list = byColor.get(c) ?? [];
    list.push(BOOKING_STATUS_LABELS[s]);
    byColor.set(c, list);
  }
  return [...byColor.entries()].map(([color, labels]) => ({ color, label: labels.join(' / ') }));
}

export interface CalShow {
  id: string;
  show_date: string | null;
  status: string;
}

export interface CalendarSummary<T extends CalShow = CalShow> {
  /** Booked shows (contract onward) in the given month. */
  monthBooked: number;
  /** Shows still in outreach (pitch / negotiation / hold) dated today or later. */
  pipeline: number;
  /** Next booked show from today, if any. */
  next: { show: T; daysAway: number } | null;
  /** Booked shows in the next 30 days, including today. */
  next30: number;
}

const OUTREACH = new Set(['pitch', 'negotiation', 'hold']);
const isBooked = (s: CalShow): boolean => (BOOKED_SHOW_STATUSES as readonly string[]).includes(s.status);

function daysBetween(from: string, to: string): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}

/**
 * Numbers for the Calendar trackers.
 *
 * @param shows Every show on the calendar.
 * @param today Local YYYY-MM-DD.
 * @param year  The month being viewed (four-digit year).
 * @param month The month being viewed (0-based).
 */
export function summarizeCalendar<T extends CalShow>(shows: ReadonlyArray<T>, today: string, year: number, month: number): CalendarSummary<T> {
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  let monthBooked = 0;
  let pipeline = 0;
  let next30 = 0;
  let next: CalendarSummary<T>['next'] = null;
  for (const s of shows) {
    if (!s.show_date) continue;
    const d = s.show_date.slice(0, 10);
    if (isBooked(s) && d.startsWith(monthPrefix)) monthBooked++;
    if (d < today) continue;
    if (OUTREACH.has(s.status)) pipeline++;
    if (!isBooked(s) || s.status === 'completed') continue;
    const away = daysBetween(today, d);
    if (away < 30) next30++;
    if (!next || d < next.show.show_date!.slice(0, 10)) next = { show: s, daysAway: away };
  }
  return { monthBooked, pipeline, next, next30 };
}

/** Groups shows by YYYY-MM-DD, keeping the input order within a day. */
export function byDate<T extends { show_date: string | null }>(shows: ReadonlyArray<T>): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const s of shows) {
    const d = s.show_date?.slice(0, 10);
    if (!d) continue;
    (out[d] ??= []).push(s);
  }
  return out;
}

/** Set time "21:30:00" → "9:30 PM"; null when blank or unreadable. */
export function clock(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}
