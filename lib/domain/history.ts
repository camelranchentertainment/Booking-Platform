// lib/domain/history.ts
//
// Pure helpers for Show History (pages/history.tsx): filtering, the headline
// stats, the best rooms, shows per state for the tile map, year grouping and
// the CSV rows. No I/O, so each is unit-tested.
//
// Money: members never see it. The page only requests deal and pay fields for
// admins, and the CSV only includes them when `withMoney` is set. "Avg pay" is
// actual_amount_received on completed shows marked received (the Earned rule).

export interface HistoryShow {
  id: string;
  show_date: string;
  status: string;
  deal_type?: string | null;
  agreed_amount?: number | string | null;
  fee?: number | string | null;
  actual_amount_received?: number | string | null;
  payment_status?: string | null;
  post_show_notes?: string | null;
  rebook_flag?: string | null;
  rating?: number | null;
  attendance?: number | null;
  would_return?: boolean | null;
  venue_feedback?: string | null;
  venue?: { id?: string | null; name?: string | null; city?: string | null; state?: string | null } | null;
}

export const DEAL_LABELS: Record<string, string> = {
  guarantee: 'Guarantee',
  door_split: 'Door split',
  percentage: 'Percentage',
  flat_fee: 'Flat fee',
  other: 'Other',
};

/** Would the band play this room again? would_return wins; else the rebook flag; null when unknown. */
export function wouldReturn(b: HistoryShow): boolean | null {
  if (b.would_return != null) return b.would_return;
  if (b.rebook_flag === 'yes') return true;
  if (b.rebook_flag === 'no') return false;
  return null;
}

/** Played but not marked completed — still needs settling. */
export function needsSettle(b: HistoryShow): boolean {
  return b.status !== 'completed';
}

/** Money received for a show under the Earned rule; null otherwise. */
export function paidAmount(b: HistoryShow): number | null {
  if (b.status !== 'completed' || b.payment_status !== 'received') return null;
  const n = Number(b.actual_amount_received);
  return b.actual_amount_received == null || b.actual_amount_received === '' || !Number.isFinite(n) ? null : n;
}

export interface HistoryFilter {
  query: string;
  year: string;
  state: string;
  minRating: number;
  /** '' any, 'yes', 'no' */
  returns: '' | 'yes' | 'no';
}

export const EMPTY_FILTER: HistoryFilter = { query: '', year: '', state: '', minRating: 0, returns: '' };

/** Shows matching the filter, keeping the input order (newest first from the query). */
export function filterHistory(list: readonly HistoryShow[], f: HistoryFilter): HistoryShow[] {
  const q = f.query.trim().toLowerCase();
  return list.filter(b => {
    if (q && ![b.venue?.name, b.venue?.city].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
    if (f.year && !b.show_date.startsWith(`${f.year}-`)) return false;
    if (f.state && (b.venue?.state ?? '').toUpperCase() !== f.state) return false;
    if (f.minRating && (b.rating ?? 0) < f.minRating) return false;
    if (f.returns === 'yes' && wouldReturn(b) !== true) return false;
    if (f.returns === 'no' && wouldReturn(b) !== false) return false;
    return true;
  });
}

export interface HistoryStats {
  shows: number;
  venues: number;
  states: number;
  /** Average of rated shows, one decimal; null when none are rated. */
  avgRating: number | null;
  rated: number;
  /** Would-return yes ÷ shows with an answer; null when none answered. */
  returnPct: number | null;
  answered: number;
  needsSettle: number;
  firstYear: number | null;
}

export function historyStats(list: readonly HistoryShow[]): HistoryStats {
  const rated = list.filter(b => typeof b.rating === 'number' && b.rating > 0);
  const answered = list.map(wouldReturn).filter((v): v is boolean => v !== null);
  const years = list.map(b => Number(b.show_date.slice(0, 4))).filter(Number.isFinite);
  return {
    shows: list.length,
    venues: new Set(list.map(b => b.venue?.id).filter(Boolean)).size,
    states: new Set(list.map(b => (b.venue?.state ?? '').toUpperCase()).filter(Boolean)).size,
    avgRating: rated.length ? Math.round((rated.reduce((s, b) => s + (b.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
    rated: rated.length,
    returnPct: answered.length ? Math.round((answered.filter(Boolean).length / answered.length) * 100) : null,
    answered: answered.length,
    needsSettle: list.filter(needsSettle).length,
    firstYear: years.length ? Math.min(...years) : null,
  };
}

export interface RoomScore {
  id: string;
  name: string;
  place: string;
  shows: number;
  avgRating: number | null;
  returns: number;
  answered: number;
  /** Average received on paid shows; null when none are paid (or money is hidden). */
  avgPay: number | null;
}

/**
 * The band's best rooms: rated shows rank by average rating plus a bonus for
 * "would return"; unrated rooms rank below by how often they've been played.
 */
export function bestRooms(list: readonly HistoryShow[], limit = 8): RoomScore[] {
  const map = new Map<string, { row: RoomScore; ratings: number[]; pays: number[] }>();
  for (const b of list) {
    const id = b.venue?.id;
    if (!id) continue;
    const entry = map.get(id) ?? {
      row: {
        id, name: b.venue?.name || 'Venue', place: [b.venue?.city, b.venue?.state].filter(Boolean).join(', '),
        shows: 0, avgRating: null, returns: 0, answered: 0, avgPay: null,
      },
      ratings: [], pays: [],
    };
    entry.row.shows += 1;
    if (typeof b.rating === 'number' && b.rating > 0) entry.ratings.push(b.rating);
    const r = wouldReturn(b);
    if (r !== null) { entry.row.answered += 1; if (r) entry.row.returns += 1; }
    const p = paidAmount(b);
    if (p !== null) entry.pays.push(p);
    map.set(id, entry);
  }
  const score = (x: RoomScore) => (x.avgRating ?? 0) + (x.answered ? (x.returns / x.answered) * 2 : 0);
  return [...map.values()]
    .map(({ row, ratings, pays }) => ({
      ...row,
      avgRating: ratings.length ? Math.round((ratings.reduce((s, n) => s + n, 0) / ratings.length) * 10) / 10 : null,
      avgPay: pays.length ? Math.round(pays.reduce((s, n) => s + n, 0) / pays.length) : null,
    }))
    .sort((a, b) => {
      const ra = a.avgRating !== null || a.answered > 0;
      const rb = b.avgRating !== null || b.answered > 0;
      if (ra !== rb) return ra ? -1 : 1;
      return score(b) - score(a) || b.shows - a.shows || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/** Shows per state (upper-case postal code), for the tile map. */
export function showsByState(list: readonly HistoryShow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of list) {
    const s = (b.venue?.state ?? '').trim().toUpperCase();
    if (s) m.set(s, (m.get(s) ?? 0) + 1);
  }
  return m;
}

/** Groups newest-first shows by year, newest year first. */
export function groupByYear(list: readonly HistoryShow[]): Array<{ year: string; items: HistoryShow[] }> {
  const out: Array<{ year: string; items: HistoryShow[] }> = [];
  for (const b of list) {
    const year = b.show_date.slice(0, 4);
    const g = out.find(x => x.year === year) ?? (out.push({ year, items: [] }), out[out.length - 1]);
    g.items.push(b);
  }
  return out;
}

/**
 * US tile-map position (column, row) for each state + DC, on a 12 × 8 grid —
 * the common "state bins" layout, so the map reads like the country.
 */
export const STATE_TILES: Record<string, [number, number]> = {
  AK: [0, 0], ME: [11, 0],
  WI: [6, 1], VT: [10, 1], NH: [11, 1],
  WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], MI: [7, 2], NY: [9, 2], MA: [10, 2],
  OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3], RI: [11, 3],
  CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4],
  AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5],
  OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6],
  HI: [0, 7], TX: [4, 7], FL: [9, 7],
};

/** CSV rows for the filtered shows. Money columns only when `withMoney`. */
export function historyCsvRows(list: readonly HistoryShow[], withMoney: boolean): Array<Array<string | number>> {
  const head = ['Date', 'Venue', 'City', 'State', 'Status',
    ...(withMoney ? ['Deal', 'Agreed', 'Received', 'Payment'] : []),
    'Rating', 'Attendance', 'Would return', 'Notes'];
  return [head, ...list.map(b => {
    const r = wouldReturn(b);
    return [
      b.show_date, b.venue?.name ?? '', b.venue?.city ?? '', b.venue?.state ?? '', b.status,
      ...(withMoney ? [
        DEAL_LABELS[b.deal_type ?? ''] ?? b.deal_type ?? '',
        b.agreed_amount ?? b.fee ?? '',
        b.actual_amount_received ?? '',
        b.payment_status ?? '',
      ] : []),
      b.rating ?? '', b.attendance ?? '', r === null ? '' : r ? 'Yes' : 'No', b.post_show_notes ?? '',
    ].map(v => (v === null || v === undefined ? '' : v));
  })];
}

/** One CSV document; every cell quoted, quotes doubled. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}
