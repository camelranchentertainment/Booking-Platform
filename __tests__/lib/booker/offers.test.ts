// __tests__/lib/booker/offers.test.ts
// Offers and deal memos: filling standard terms, drafting from a show, labels,
// file names, stand-by dates, a venue's record, the covering email, and the
// form rules.

import {
  dealSummary,
  draftFromShow,
  fillTemplate,
  isLapsed,
  longDate,
  offerEmail,
  offerFilename,
  offerLabel,
  openOffers,
  placeholderValues,
  unknownPlaceholders,
  venueOfferRecord,
} from '../../../lib/booker/offers';
import { OfferTermsSchema, OfferTemplateSchema } from '../../../lib/booker/schemas';
import type { BookerShow } from '../../../lib/booker/types';

const TODAY = '2026-10-21';
const show = (over: Partial<BookerShow> = {}): BookerShow => ({
  id: 's1',
  booker_id: 'k',
  roster_id: 'b1',
  venue_id: 'v1',
  venue_name: null,
  venue_city: null,
  show_date: '2026-11-14',
  load_in_time: '17:00:00',
  door_time: null,
  set_time: '21:00:00',
  set_length_min: 90,
  status: 'hold',
  deal_type: 'guarantee',
  fee: 1500,
  actual_amount: null,
  commission_pct_override: null,
  deal_notes: '80/20 after costs',
  internal_notes: 'SECRET',
  followup_on: null,
  hold_rank: 1,
  hold_expires_on: null,
  answer_by: null,
  challenge_note: null,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  ...over,
});

describe('fillTemplate and unknownPlaceholders', () => {
  it('fills known placeholders, TBD for blanks, and leaves typos visible', () => {
    expect(fillTemplate('Hi {{ Buyer }}, {{fee}} on {{date}}; {{deposit}}; {{feee}}', { buyer: 'Sarah', fee: '$1,500.00', date: 'Saturday', deposit: '' })).toBe(
      'Hi Sarah, $1,500.00 on Saturday; TBD; {{feee}}',
    );
    expect(unknownPlaceholders('{{fee}} {{Feee}} {{venue}} {{feee}} {{nope}}')).toEqual(['Feee', 'feee', 'nope']);
  });
});

describe('longDate', () => {
  it('formats without time-zone drift and tolerates blanks', () => {
    expect(longDate('2026-11-14')).toBe('Saturday, November 14, 2026');
    expect(longDate(null)).toBe('');
    expect(longDate('not a date')).toBe('');
  });
});

describe('draftFromShow', () => {
  const venue = { name: 'Saxon Pub', city: 'Austin', state: 'TX' };
  it('takes band, venue, date, times and deal from the show, never internal notes', () => {
    const d = draftFromShow({ show: show(), band: { band_name: 'The Band' }, venue, contact: { name: 'Sarah Lee', email: 's@x.com' }, template: null, kind: 'offer', agencyName: 'Ace', today: TODAY });
    expect(d).toMatchObject({
      band_name: 'The Band',
      venue_name: 'Saxon Pub',
      venue_city: 'Austin',
      venue_state: 'TX',
      show_date: '2026-11-14',
      load_in_time: '17:00',
      set_time: '21:00',
      set_length_min: 90,
      deal_type: 'guarantee',
      fee: 1500,
      deal_terms: null,
      buyer_name: 'Sarah Lee',
      buyer_email: 's@x.com',
      expires_on: '2026-10-28',
      terms: null,
    });
    expect(JSON.stringify(d)).not.toContain('SECRET');
  });

  it('carries door/percentage terms in words, uses a typed venue, and deal memos do not lapse', () => {
    const d = draftFromShow({
      show: show({ venue_id: null, venue_name: 'Typed Room', venue_city: 'Dallas', deal_type: 'door' }),
      band: { band_name: 'B' },
      venue: null,
      contact: null,
      template: null,
      kind: 'deal_memo',
      agencyName: null,
      today: TODAY,
    });
    expect(d).toMatchObject({ venue_name: 'Typed Room', venue_city: 'Dallas', deal_terms: '80/20 after costs', expires_on: null });
  });

  it('fills the template from the show', () => {
    const d = draftFromShow({
      show: show(),
      band: { band_name: 'The Band' },
      venue,
      contact: { name: 'Sarah', email: null },
      template: { id: 't1', terms: '{{band}} at {{venue}} on {{date}} for {{fee}}. Set {{set_time}}. From {{agency}}.', hospitality: 'Dinner for {{band}}' },
      kind: 'offer',
      agencyName: 'Ace',
      today: TODAY,
    });
    expect(d.template_id).toBe('t1');
    expect(d.terms).toBe('The Band at Saxon Pub on Saturday, November 14, 2026 for $1,500.00. Set 9:00 PM. From Ace.');
    expect(d.hospitality).toBe('Dinner for The Band');
  });
});

describe('labels, file names and summaries', () => {
  const o = { kind: 'offer' as const, doc_number: 14, band_name: 'Jake Stringer & Better Than Nothin’', venue_name: "Cain's Ballroom / Tulsa", show_date: '2026-11-14' };
  it('names documents', () => {
    expect(offerLabel(o)).toBe('Offer #14');
    expect(offerLabel({ kind: 'deal_memo', doc_number: 3 })).toBe('Deal memo #3');
    expect(offerFilename(o)).toBe('Offer-14-Jake-Stringer-Better-Than-Nothin-Cains-Ballroom-Tulsa-2026-11-14.pdf');
    expect(offerFilename({ ...o, kind: 'deal_memo' })).toMatch(/^Deal-Memo-14-/);
  });
  it('summarises the deal', () => {
    expect(dealSummary({ deal_type: 'guarantee', fee: 1500, deal_terms: null })).toBe('Guarantee · $1,500.00');
    expect(dealSummary({ deal_type: 'door', fee: null, deal_terms: '80% after $300' })).toBe('Door deal · 80% after $300');
    expect(dealSummary({ deal_type: null, fee: null, deal_terms: null })).toBe('To be agreed');
  });
  it('fills placeholder values with blanks when unknown', () => {
    const v = placeholderValues(
      { kind: 'offer', template_id: null, band_name: 'B', venue_name: 'V', venue_city: null, venue_state: null, show_date: '2026-11-14', load_in_time: null, door_time: null, set_time: null, set_length_min: null, deal_type: null, fee: null, deal_terms: null, deposit_amount: 250, deposit_due_on: '2026-11-01', hospitality: null, terms: null, buyer_name: null, buyer_email: null, expires_on: null },
      null,
    );
    expect(v).toMatchObject({ city: '', fee: '', deposit: '$250.00', deposit_due: 'Sunday, November 1, 2026', agency: '' });
  });
});

describe('stand-by dates, open offers and a venue record', () => {
  it('flags sent offers past their date only', () => {
    expect(isLapsed({ status: 'sent', expires_on: '2026-10-20' }, TODAY)).toBe(true);
    expect(isLapsed({ status: 'sent', expires_on: TODAY }, TODAY)).toBe(false);
    expect(isLapsed({ status: 'accepted', expires_on: '2026-10-01' }, TODAY)).toBe(false);
    expect(isLapsed({ status: 'sent', expires_on: null }, TODAY)).toBe(false);
  });
  it('lists drafts and sent offers as open', () => {
    const rows = [
      { id: 'a', status: 'draft' as const, deleted_at: null },
      { id: 'b', status: 'sent' as const, deleted_at: null },
      { id: 'c', status: 'accepted' as const, deleted_at: null },
      { id: 'd', status: 'draft' as const, deleted_at: '2026-10-01' },
    ];
    expect(openOffers(rows).map(r => r.id)).toEqual(['a', 'b']);
  });
  it('counts how a venue answered offers, ignoring drafts, memos and withdrawn', () => {
    const r = (status: 'draft' | 'sent' | 'accepted' | 'declined' | 'withdrawn', kind: 'offer' | 'deal_memo' = 'offer') => ({ status, kind, deleted_at: null });
    expect(venueOfferRecord([r('accepted'), r('accepted'), r('declined'), r('sent'), r('draft'), r('withdrawn'), r('accepted', 'deal_memo')])).toEqual({ sent: 4, accepted: 2, declined: 1, acceptRate: 67 });
    expect(venueOfferRecord([r('sent')])).toEqual({ sent: 1, accepted: 0, declined: 0, acceptRate: null });
  });
});

describe('offerEmail', () => {
  it('writes a short covering email with the deal and stand-by date', () => {
    const e = offerEmail({ kind: 'offer', doc_number: 2, band_name: 'The Band', venue_name: 'Saxon Pub', show_date: '2026-11-14', buyer_name: 'Sarah Lee', expires_on: '2026-10-28', deal_type: 'guarantee', fee: 1500, deal_terms: null }, 'Ace Agency', 'Ann');
    expect(e.subject).toBe('Offer: The Band at Saxon Pub, Saturday, November 14, 2026');
    expect(e.body).toContain('Hi Sarah,');
    expect(e.body).toContain('Deal: Guarantee · $1,500.00.');
    expect(e.body).toContain('This offer stands until Wednesday, October 28, 2026.');
    expect(e.body.endsWith('Ann\nAce Agency')).toBe(true);
  });
  it('words a deal memo differently', () => {
    const e = offerEmail({ kind: 'deal_memo', doc_number: 3, band_name: 'B', venue_name: 'V', show_date: '2026-11-14', buyer_name: null, expires_on: null, deal_type: null, fee: null, deal_terms: null }, null, null);
    expect(e.subject.startsWith('Deal memo:')).toBe(true);
    expect(e.body).toContain('Hi there,');
    expect(e.body).toContain('confirming B at V');
  });
});

describe('OfferTermsSchema and OfferTemplateSchema', () => {
  const base = { band_name: 'B', venue_name: 'V', show_date: '2026-11-14' };
  it('accepts a minimal offer and blanks become null', () => {
    const p = OfferTermsSchema.parse({ ...base, fee: '', deposit_amount: '', buyer_email: '' });
    expect(p).toMatchObject({ kind: 'offer', fee: null, deposit_amount: null, buyer_email: null });
  });
  it('needs a deposit amount with a due date, and no deposit above the fee', () => {
    expect(OfferTermsSchema.safeParse({ ...base, deposit_due_on: '2026-11-01' }).success).toBe(false);
    expect(OfferTermsSchema.safeParse({ ...base, fee: '500', deposit_amount: '600' }).success).toBe(false);
    expect(OfferTermsSchema.safeParse({ ...base, fee: '500', deposit_amount: '250', deposit_due_on: '2026-11-01' }).success).toBe(true);
  });
  it('rejects a bad buyer email and over-long terms', () => {
    expect(OfferTermsSchema.safeParse({ ...base, buyer_email: 'nope' }).success).toBe(false);
    expect(OfferTermsSchema.safeParse({ ...base, terms: 'x'.repeat(8001) }).success).toBe(false);
  });
  it('validates templates', () => {
    expect(OfferTemplateSchema.parse({ name: ' Club ', terms: 'x', is_default: 'true' })).toMatchObject({ name: 'Club', is_default: true, hospitality: null });
    expect(OfferTemplateSchema.safeParse({ name: '', terms: 'x' }).success).toBe(false);
  });
});
