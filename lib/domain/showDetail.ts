// lib/domain/showDetail.ts
// Pure helpers for the show detail page (pages/bookings/[id].tsx). Unit-tested.

import { daysBetween, formatClock } from './showDay';

/** Values the bookings.payment_status CHECK constraint allows. */
export const PAYMENT_STATUSES = ['pending', 'received', 'settled'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Waiting on payment',
  received: 'Received',
  settled: 'Settled (band paid out)',
};

/** Narrows a stored/edited value to an allowed payment status, else null. */
export function toPaymentStatus(v: unknown): PaymentStatus | null {
  return typeof v === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(v) ? (v as PaymentStatus) : null;
}

export interface ScheduleTimes {
  load_in_time: string | null;
  soundcheck_time: string | null;
  door_time: string | null;
  set_time: string | null;
  set_length_min: number | null;
  end_time: string | null;
}

export interface ScheduleStep {
  key: string;
  label: string;
  value: string | null;
}

/** The show's schedule in order: load-in, sound check, doors, set, set length, end. */
export function schedule(b: ScheduleTimes): ScheduleStep[] {
  const len = b.set_length_min ? formatLength(b.set_length_min) : null;
  return [
    { key: 'load_in', label: 'Load-in', value: formatClock(b.load_in_time) },
    { key: 'soundcheck', label: 'Sound check', value: formatClock(b.soundcheck_time) },
    { key: 'doors', label: 'Doors', value: formatClock(b.door_time) },
    { key: 'set', label: 'Set time', value: formatClock(b.set_time) },
    { key: 'length', label: 'Set length', value: len },
    { key: 'end', label: 'Done by', value: formatClock(b.end_time) },
  ];
}

/** 90 → "1 hr 30 min", 45 → "45 min". */
export function formatLength(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** "Tonight", "Tomorrow", "In 12 days", "3 days ago", or null without a date. */
export function countdown(showDate: string | null, today: string): string | null {
  if (!showDate) return null;
  const d = daysBetween(today, showDate);
  if (d === 0) return 'Tonight';
  if (d === 1) return 'Tomorrow';
  if (d > 1) return `In ${d} days`;
  if (d === -1) return 'Yesterday';
  return `${-d} days ago`;
}

/** Played-but-not-settled shows: past date and still in a booked status. */
export function canMarkPlayed(status: string, showDate: string | null, today: string): boolean {
  return !!showDate && showDate < today && ['contract', 'confirmed', 'advancing'].includes(status);
}

/**
 * A show may be deleted outright only when nothing about it is history or
 * money: not played, no money received, not in the past. Anything else is
 * cancelled instead, so money and history are kept (financial data is
 * archived, never deleted).
 */
export function canDeleteShow(b: { status: string; show_date: string | null; actual_amount_received: number | string | null }, today: string): boolean {
  if (b.status === 'completed') return false;
  if (Number(b.actual_amount_received) > 0) return false;
  if (b.show_date && b.show_date < today) return false;
  return true;
}

/** Sum of the lineup's pay. */
export function lineupTotal(rows: ReadonlyArray<{ amount: number }>): number {
  return rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);
}

/** "$1,250" or null. */
export function dollars(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** Parses an optional dollar input; '' → null, garbage/negative → NaN marker via `ok: false`. */
export function parseMoneyInput(v: string): { ok: true; value: number | null } | { ok: false } {
  const s = v.trim().replace(/[$,]/g, '');
  if (s === '') return { ok: true, value: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}
