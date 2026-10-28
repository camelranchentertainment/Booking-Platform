// lib/domain/memberShows.ts
//
// Pure helpers for the member pages (pages/member/*): the run of show for a
// day, the next show, maps links, RSVP counts and the month grid. No I/O, so
// each is unit-tested. Nothing here touches money — members never see the
// band's fee; a member's own pay is built separately in lib/memberPay.ts.

import { formatTime } from '../booker/dates';

export interface RunOfShowSource {
  load_in_time?: string | null;
  soundcheck_time?: string | null;
  door_time?: string | null;
  set_time?: string | null;
  set_length_min?: number | null;
  end_time?: string | null;
}

export interface RunStep {
  key: 'load_in' | 'soundcheck' | 'doors' | 'set' | 'end';
  label: string;
  /** "7:30 PM" */
  time: string;
  /** "90 min" for the set, when known. */
  note?: string;
  /** Minutes after midnight, for ordering. */
  minutes: number;
}

const toMinutes = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
};

/**
 * The day's schedule in clock order (load-in, soundcheck, doors, set, end),
 * skipping anything not set. Times after midnight sort after the evening.
 */
export function runOfShow(b: RunOfShowSource): RunStep[] {
  const raw: Array<[RunStep['key'], string, string | null | undefined]> = [
    ['load_in', 'Load-in', b.load_in_time],
    ['soundcheck', 'Soundcheck', b.soundcheck_time],
    ['doors', 'Doors', b.door_time],
    ['set', 'Set', b.set_time],
    ['end', 'End', b.end_time],
  ];
  const steps: RunStep[] = [];
  for (const [key, label, value] of raw) {
    const time = formatTime(value);
    if (!time || !value) continue;
    let minutes = toMinutes(value);
    // A 1 AM end belongs after a 10 PM set, not before load-in.
    if (minutes < 6 * 60) minutes += 24 * 60;
    steps.push({ key, label, time, minutes, note: key === 'set' && b.set_length_min ? `${b.set_length_min} min` : undefined });
  }
  return steps.sort((a, b2) => a.minutes - b2.minutes);
}

/** A Google Maps search link for a venue, or null when there's nothing to search. */
export function mapsUrl(v: { name?: string | null; address?: string | null; city?: string | null; state?: string | null } | null | undefined): string | null {
  if (!v) return null;
  const q = [v.address || v.name, v.city, v.state].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** Whole days from `today` to `date` (both YYYY-MM-DD). */
export function daysUntil(date: string, today: string): number {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** "Tonight", "Tomorrow", "In 5 days", "In 3 weeks". */
export function whenLabel(date: string, today: string): string {
  const d = daysUntil(date, today);
  if (d <= 0) return 'Tonight';
  if (d === 1) return 'Tomorrow';
  if (d < 14) return `In ${d} days`;
  if (d < 60) return `In ${Math.round(d / 7)} weeks`;
  return `In ${Math.round(d / 30)} months`;
}

export type Rsvp = 'pending' | 'confirmed' | 'declined';

/** RSVP counts for roster spots dated today or later. */
export function rsvpCounts(rows: ReadonlyArray<{ status: string; show_date: string | null }>, today: string): Record<Rsvp, number> {
  const out: Record<Rsvp, number> = { pending: 0, confirmed: 0, declined: 0 };
  for (const r of rows) {
    if (!r.show_date || r.show_date < today) continue;
    const s: Rsvp = r.status === 'confirmed' || r.status === 'declined' ? r.status : 'pending';
    out[s] += 1;
  }
  return out;
}

export interface DayCell {
  /** YYYY-MM-DD, or null for a blank before the 1st / after the last day. */
  date: string | null;
  day: number | null;
}

/** The month as whole weeks (Sunday first), padded with blanks. */
export function monthGrid(year: number, month: number): DayCell[] {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: DayCell[] = Array.from({ length: first }, () => ({ date: null, day: null }));
  for (let d = 1; d <= days; d++) {
    cells.push({ date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
  return cells;
}
