// lib/booker/workspace.ts
// Pure helpers that combine the agent's rows for display: lookups, venue labels,
// grouping by date and the "needs attention" list. No I/O, so they are unit-tested.

import { isLapsed, offerLabel, type BookerOffer } from './offers';
import type { BookerMessage, BookerShow, BookerVenue, CommissionPayment, RosterBand } from './types';
import { commissionDue, formatMoney, paidForShow, toAmount } from './commission';
import { addDays, formatShowDate } from './dates';
import { findHoldClashes, holdLabel, holdStatus, holdStatusText, holdsByUrgency } from './holds';

export function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map(r => [r.id, r]));
}

/** "Venue — City" from the saved venue, or the free-text fallback on the show. */
export function venueLabel(show: Pick<BookerShow, 'venue_id' | 'venue_name' | 'venue_city'>, venuesById: ReadonlyMap<string, Pick<BookerVenue, 'name' | 'city'>>): string {
  const saved = show.venue_id ? venuesById.get(show.venue_id) : undefined;
  const name = saved?.name ?? show.venue_name ?? 'Venue not set';
  const city = saved ? saved.city : show.venue_city;
  return city ? `${name} — ${city}` : name;
}

/** Shows grouped by date, dates in ascending order, cancelled shows left out. */
export function groupByDate<T extends Pick<BookerShow, 'show_date' | 'status'>>(shows: readonly T[]): Array<{ date: string; shows: T[] }> {
  const groups = new Map<string, T[]>();
  for (const s of shows) {
    if (s.status === 'cancelled') continue;
    const list = groups.get(s.show_date) ?? [];
    list.push(s);
    groups.set(s.show_date, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, shows: list }));
}

/** Other non-cancelled shows for the same band on the same date (possible double-booking). */
export function findConflicts(shows: readonly BookerShow[], rosterId: string, date: string, excludeId?: string): BookerShow[] {
  return shows.filter(s => s.roster_id === rosterId && s.show_date === date && s.status !== 'cancelled' && s.id !== excludeId && !s.deleted_at);
}

export type AttentionKind = 'email_followup' | 'offer_lapsed' | 'deposit_overdue' | 'deposit_due' | 'commission_overdue' | 'hold_deadline' | 'hold_clash' | 'followup_due' | 'stale_hold' | 'needs_settling' | 'band_without_rate';

export interface AttentionItem {
  kind: AttentionKind;
  /** Stable key for React lists */
  key: string;
  message: string;
  showId?: string;
  rosterId?: string;
  /** For email follow-ups: the message to mark done */
  messageId?: string;
  /** Where "Open" goes when it is not a show dialog */
  href?: string;
}

/**
 * What the agent should look at today, most urgent first:
 *   1. hold deadlines: a venue challenge to answer, or a hold about to lapse
 *      (most pressing first; see lib/booker/holds.ts)
 *   2. two of the agent's own bands at the same venue on the same date
 *   3. follow-ups due today or overdue (on holds/pending)
 *   4. holds/pending whose date has passed without being confirmed or cancelled
 *   5. confirmed shows in the past that still need marking played
 *   6. active bands with no commission rate set
 */
export function attentionItems(
  shows: readonly BookerShow[],
  bands: readonly RosterBand[],
  venuesById: ReadonlyMap<string, BookerVenue>,
  today: string,
): AttentionItem[] {
  const bandsById = byId(bands);
  const name = (s: BookerShow) => bandsById.get(s.roster_id)?.band_name ?? 'Unknown band';
  const items: AttentionItem[] = [];
  const open = shows.filter(s => !s.deleted_at);
  const year = Number(today.slice(0, 4));

  for (const s of holdsByUrgency(open, today)) {
    const st = holdStatus(s, today);
    if (!st) break; // sorted: everything after this has no pressing deadline
    const rank = holdLabel(s.hold_rank);
    items.push({
      kind: 'hold_deadline',
      key: `d-${s.id}`,
      showId: s.id,
      message: `${holdStatusText(st, year)}: ${name(s)}${rank ? ` (${rank})` : ''} at ${venueLabel(s, venuesById)}, ${formatShowDate(s.show_date, year)}`,
    });
  }
  const byShow = byId(open);
  for (const c of findHoldClashes(open, today)) {
    const involved = c.showIds.map(id => byShow.get(id)).filter((x): x is BookerShow => Boolean(x));
    const who = involved.map(x => `${name(x)}${x.hold_rank ? ` (${holdLabel(x.hold_rank)})` : x.status === 'confirmed' ? ' (confirmed)' : ''}`).join(' and ');
    items.push({
      kind: 'hold_clash',
      key: `c-${c.date}-${c.showIds.join('-')}`,
      showId: c.showIds[0],
      message: `${c.sameRank ? 'Same hold position: ' : ''}${who} are both at ${venueLabel(involved[0], venuesById)} on ${formatShowDate(c.date, year)}`,
    });
  }

  for (const s of open) {
    if ((s.status === 'hold' || s.status === 'pending') && s.followup_on && s.followup_on <= today) {
      items.push({ kind: 'followup_due', key: `f-${s.id}`, showId: s.id, message: `Follow up: ${name(s)} at ${venueLabel(s, venuesById)}` });
    }
  }
  for (const s of open) {
    if ((s.status === 'hold' || s.status === 'pending') && s.show_date < today) {
      items.push({ kind: 'stale_hold', key: `h-${s.id}`, showId: s.id, message: `${name(s)} on ${formatShowDate(s.show_date)} is still a ${s.status} — confirm or cancel it` });
    }
  }
  for (const s of open) {
    if (s.status === 'confirmed' && s.show_date < today) {
      items.push({ kind: 'needs_settling', key: `p-${s.id}`, showId: s.id, message: `${name(s)} at ${venueLabel(s, venuesById)} on ${formatShowDate(s.show_date)} — mark it Played to track commission` });
    }
  }
  for (const b of bands) {
    if (b.status === 'active' && !b.deleted_at && b.commission_pct === null) {
      items.push({ kind: 'band_without_rate', key: `r-${b.id}`, rosterId: b.id, message: `${b.band_name} has no commission rate set` });
    }
  }
  return items;
}

/** Per-band summary for the home tiles. */
export interface BandTileSummary {
  band: RosterBand;
  nextShow: BookerShow | null;
  upcomingCount: number;
  holdCount: number;
}

export function bandTiles(bands: readonly RosterBand[], shows: readonly BookerShow[], today: string): BandTileSummary[] {
  return bands
    .filter(b => b.status === 'active' && !b.deleted_at)
    .map(band => {
      const upcoming = shows
        .filter(s => s.roster_id === band.id && !s.deleted_at && s.show_date >= today && s.status !== 'cancelled')
        .sort((a, b) => a.show_date.localeCompare(b.show_date));
      return {
        band,
        nextShow: upcoming.find(s => s.status === 'confirmed') ?? upcoming[0] ?? null,
        upcomingCount: upcoming.filter(s => s.status === 'confirmed').length,
        holdCount: upcoming.filter(s => s.status === 'hold' || s.status === 'pending').length,
      };
    });
}

/**
 * Played shows still owed commission, as options for the payment form.
 *
 * @param repeats ids of repeat bookings (repeatShowIds), for the band's repeat rate
 */
export function payableShows(
  shows: readonly BookerShow[],
  bandsById: ReadonlyMap<string, RosterBand>,
  venuesById: ReadonlyMap<string, BookerVenue>,
  repeats: ReadonlySet<string> = new Set(),
): Array<{ id: string; label: string; due: number }> {
  return shows
    .filter(s => s.status === 'played' && !s.deleted_at)
    .sort((a, b) => b.show_date.localeCompare(a.show_date))
    .map(s => {
      const band = bandsById.get(s.roster_id);
      return { id: s.id, label: `${formatShowDate(s.show_date)} · ${band?.band_name ?? 'Unknown band'} · ${venueLabel(s, venuesById)}`, due: commissionDue(s, band, repeats.has(s.id)) };
    });
}

/**
 * Email follow-ups that are due today or overdue and not yet marked done,
 * oldest first. "Open" goes to the venue, else the band, the email is about.
 */
export function emailFollowups(messages: readonly BookerMessage[], venuesById: ReadonlyMap<string, Pick<BookerVenue, 'name'>>, today: string): AttentionItem[] {
  return messages
    .filter(m => m.status === 'sent' && !m.deleted_at && m.followup_on && !m.followup_done_at && m.followup_on <= today)
    .sort((a, b) => (a.followup_on ?? '').localeCompare(b.followup_on ?? ''))
    .map(m => {
      const venue = m.venue_id ? venuesById.get(m.venue_id)?.name : undefined;
      const who = m.to_name ?? m.to_email;
      return {
        kind: 'email_followup' as const,
        key: `e-${m.id}`,
        messageId: m.id,
        href: m.venue_id ? `/agent/venues/${m.venue_id}` : m.roster_id ? `/agent/bands/${m.roster_id}` : undefined,
        message: `Follow up with ${who}${venue ? ` (${venue})` : ''}: “${m.subject}”`,
      };
    });
}

/**
 * Sent offers still waiting on the buyer after their stand-by date, oldest
 * deadline first: chase the buyer, record their answer, or withdraw.
 * "Open" opens the show, where Offers & deal memos lives.
 */
export function lapsedOfferItems(
  offers: readonly Pick<BookerOffer, 'id' | 'show_id' | 'status' | 'kind' | 'doc_number' | 'band_name' | 'venue_name' | 'expires_on' | 'buyer_name' | 'deleted_at'>[],
  today: string,
): AttentionItem[] {
  const year = Number(today.slice(0, 4));
  return offers
    .filter(o => !o.deleted_at && isLapsed(o, today))
    .sort((a, b) => (a.expires_on ?? '').localeCompare(b.expires_on ?? ''))
    .map(o => ({
      kind: 'offer_lapsed' as const,
      key: `o-${o.id}`,
      showId: o.show_id,
      message: `${offerLabel(o)} for ${o.band_name} at ${o.venue_name} stood until ${formatShowDate(o.expires_on ?? today, year)} with no answer${o.buyer_name ? ` from ${o.buyer_name}` : ''} — chase it, record the answer, or withdraw it`,
    }));
}

/** Days ahead that make a deposit "due soon". */
export const DEPOSIT_WARN_DAYS = 7;
/** Days after a played show before unpaid commission counts as overdue. */
export const COMMISSION_OVERDUE_DAYS = 30;

/**
 * Money that needs chasing, most pressing first:
 *   1. deposits past their due date and not received (live shows only)
 *   2. deposits due within DEPOSIT_WARN_DAYS
 *   3. commission still owed COMMISSION_OVERDUE_DAYS or more after a played
 *      show, one line per band, biggest balance first
 *
 * @param repeats ids of repeat bookings (repeatShowIds), for the band's repeat rate
 */
export function moneyAttentionItems(
  shows: readonly BookerShow[],
  bands: readonly RosterBand[],
  payments: ReadonlyArray<Pick<CommissionPayment, 'show_id' | 'amount' | 'deleted_at'>>,
  venuesById: ReadonlyMap<string, BookerVenue>,
  today: string,
  repeats: ReadonlySet<string> = new Set(),
): AttentionItem[] {
  const bandsById = byId(bands);
  const year = Number(today.slice(0, 4));
  const name = (s: BookerShow) => bandsById.get(s.roster_id)?.band_name ?? 'Unknown band';
  const live = shows.filter(s => !s.deleted_at && s.status !== 'cancelled');
  const soon = addDays(today, DEPOSIT_WARN_DAYS);
  const owedDeposits = live
    .filter(s => toAmount(s.deposit_amount) !== null && s.deposit_due_on && !s.deposit_received_on)
    .sort((a, b) => (a.deposit_due_on ?? '').localeCompare(b.deposit_due_on ?? ''));

  const items: AttentionItem[] = [];
  for (const s of owedDeposits) {
    const due = s.deposit_due_on as string;
    if (due >= today) continue;
    items.push({
      kind: 'deposit_overdue',
      key: `do-${s.id}`,
      showId: s.id,
      message: `Deposit of ${formatMoney(toAmount(s.deposit_amount))} for ${name(s)} at ${venueLabel(s, venuesById)} (${formatShowDate(s.show_date, year)}) was due ${formatShowDate(due, year)} — chase it or mark it received`,
    });
  }
  for (const s of owedDeposits) {
    const due = s.deposit_due_on as string;
    if (due < today || due > soon) continue;
    items.push({
      kind: 'deposit_due',
      key: `dd-${s.id}`,
      showId: s.id,
      message: `Deposit of ${formatMoney(toAmount(s.deposit_amount))} for ${name(s)} at ${venueLabel(s, venuesById)} is due ${due === today ? 'today' : formatShowDate(due, year)}`,
    });
  }
  // Commission: one line per band (not per show), so a long payment backlog
  // never crowds dated items such as expiring holds off the list.
  const cutoff = addDays(today, -COMMISSION_OVERDUE_DAYS);
  const owedByBand = new Map<string, { cents: number; shows: number; oldest: string }>();
  for (const s of live) {
    if (s.status !== 'played' || s.show_date > cutoff) continue;
    const due = commissionDue(s, bandsById.get(s.roster_id), repeats.has(s.id));
    const owedCents = Math.round(due * 100) - Math.round(paidForShow(s.id, payments) * 100);
    if (owedCents <= 0) continue;
    const prev = owedByBand.get(s.roster_id);
    owedByBand.set(s.roster_id, {
      cents: (prev?.cents ?? 0) + owedCents,
      shows: (prev?.shows ?? 0) + 1,
      oldest: prev && prev.oldest < s.show_date ? prev.oldest : s.show_date,
    });
  }
  const bandLines = [...owedByBand].sort((a, b) => b[1].cents - a[1].cents);
  for (const [rosterId, o] of bandLines) {
    const bandName = bandsById.get(rosterId)?.band_name ?? 'Unknown band';
    items.push({
      kind: 'commission_overdue',
      key: `co-${rosterId}`,
      // Payments are recorded on the Commission page, so Open goes there.
      href: '/agent/commission',
      message:
        o.shows === 1
          ? `${formatMoney(o.cents / 100)} commission still owed by ${bandName} for a show on ${formatShowDate(o.oldest, year)}`
          : `${formatMoney(o.cents / 100)} commission still owed by ${bandName} across ${o.shows} shows, the oldest on ${formatShowDate(o.oldest, year)}`,
    });
  }
  return items;
}
