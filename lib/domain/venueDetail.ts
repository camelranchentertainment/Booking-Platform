// lib/domain/venueDetail.ts
// Pure helpers for the venue detail page (pages/venues/[id].tsx): the band's
// history at this venue, the hero line, and link builders. Unit-tested.

export interface VenueHistoryRow {
  id: string;
  status: string;
  show_date: string | null;
  fee: number | string | null;
  agreed_amount: number | string | null;
  actual_amount_received: number | string | null;
  /** bookings.rebook_flag: 'yes' | 'no' | 'maybe' (CHECK constraint). */
  rebook_flag: string | null;
}

export interface VenueHistory {
  played: number;
  upcoming: number;
  booked: number;
  collected: number;
  lastPlayed: string | null;
  nextShow: string | null;
  rebook: { yes: number; no: number; maybe: number };
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Booked statuses that count toward money and "next show". */
const BOOKED = new Set(['contract', 'confirmed', 'advancing', 'completed']);

/**
 * Rolls up the band's shows at one venue.
 * - booked: agreed_amount (else fee) on contract/confirmed/advancing/completed shows
 * - collected: actual_amount_received on any show
 * - played: completed shows; upcoming: booked, not completed, dated today or later
 */
export function summarizeVenueHistory(rows: readonly VenueHistoryRow[], today: string): VenueHistory {
  const out: VenueHistory = { played: 0, upcoming: 0, booked: 0, collected: 0, lastPlayed: null, nextShow: null, rebook: { yes: 0, no: 0, maybe: 0 } };
  for (const r of rows) {
    if (r.status === 'cancelled') continue;
    if (BOOKED.has(r.status)) out.booked += num(r.agreed_amount ?? r.fee);
    out.collected += num(r.actual_amount_received);
    if (r.status === 'completed') {
      out.played += 1;
      if (r.show_date && (!out.lastPlayed || r.show_date > out.lastPlayed)) out.lastPlayed = r.show_date;
    } else if (BOOKED.has(r.status) && r.show_date && r.show_date >= today) {
      out.upcoming += 1;
      if (!out.nextShow || r.show_date < out.nextShow) out.nextShow = r.show_date;
    }
    if (r.rebook_flag === 'yes' || r.rebook_flag === 'no' || r.rebook_flag === 'maybe') out.rebook[r.rebook_flag] += 1;
  }
  return out;
}

/** "Played 3 times · last Sep 2026 · next show Dec 4" style hero line. */
export function venueHeroLine(h: VenueHistory, fmt: (d: string) => string): string {
  const parts: string[] = [];
  if (h.played === 0 && h.upcoming === 0) return 'You haven’t played here yet.';
  if (h.played) parts.push(`Played ${h.played} time${h.played === 1 ? '' : 's'}`);
  if (h.lastPlayed) parts.push(`last ${fmt(h.lastPlayed)}`);
  if (h.nextShow) parts.push(`next show ${fmt(h.nextShow)}`);
  return parts.join(' · ');
}

/** Whole dollars, "$1,250"; "—" for zero. */
export function money(n: number): string {
  return n ? `$${Math.round(n).toLocaleString('en-US')}` : '—';
}

/** https:// added when a stored website has no scheme; null for blank. */
export function websiteHref(site: string | null | undefined): string | null {
  const s = (site ?? '').trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** Website shown without scheme or trailing slash. */
export function websiteLabel(site: string): string {
  return site.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/** tel: link with everything but digits and a leading + removed. */
export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** Label for the rebook flag on a past show. */
export function rebookLabel(flag: string | null): string | null {
  if (flag === 'yes') return 'Rebook';
  if (flag === 'no') return 'Don’t rebook';
  if (flag === 'maybe') return 'Maybe';
  return null;
}

const DEAL_LABELS: Record<string, string> = {
  guarantee: 'Guarantee', door_split: 'Door split', percentage: 'Percentage', flat_fee: 'Flat fee', other: 'Other deal',
};

/** Readable deal type ("door_split" → "Door split"); null when unset. */
export function dealTypeLabel(deal: string | null | undefined): string | null {
  if (!deal) return null;
  return DEAL_LABELS[deal] ?? deal.replace(/_/g, ' ');
}
