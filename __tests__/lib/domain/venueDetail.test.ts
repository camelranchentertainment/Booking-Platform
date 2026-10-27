// __tests__/lib/domain/venueDetail.test.ts
import {
  dealTypeLabel, money, rebookLabel, summarizeVenueHistory, telLink, venueHeroLine, websiteHref, websiteLabel,
  type VenueHistoryRow,
} from '../../../lib/domain/venueDetail';

const row = (over: Partial<VenueHistoryRow>): VenueHistoryRow => ({
  id: 'b', status: 'completed', show_date: '2026-05-01', fee: null, agreed_amount: null,
  actual_amount_received: null, rebook_flag: null, ...over,
});

describe('summarizeVenueHistory', () => {
  const today = '2026-10-27';
  const rows = [
    row({ id: '1', show_date: '2026-03-01', agreed_amount: 500, actual_amount_received: 500, rebook_flag: 'yes' }),
    row({ id: '2', show_date: '2026-09-12', fee: '450', actual_amount_received: '400', rebook_flag: 'maybe' }),
    row({ id: '3', status: 'confirmed', show_date: '2026-12-04', agreed_amount: 600 }),
    row({ id: '4', status: 'confirmed', show_date: '2027-01-10', agreed_amount: 650 }),
    row({ id: '5', status: 'cancelled', show_date: '2026-11-01', agreed_amount: 999 }),
    row({ id: '6', status: 'pitch', show_date: '2027-02-01', agreed_amount: 700 }),
  ];
  const h = summarizeVenueHistory(rows, today);

  it('counts played and upcoming, ignoring cancelled and pitches for money', () => {
    expect(h).toMatchObject({ played: 2, upcoming: 2, booked: 500 + 450 + 600 + 650, collected: 900 });
  });
  it('finds last played and the next show', () => {
    expect(h.lastPlayed).toBe('2026-09-12');
    expect(h.nextShow).toBe('2026-12-04');
  });
  it('reads rebook flags as yes/no/maybe text (they were compared to booleans before)', () => {
    expect(h.rebook).toEqual({ yes: 1, no: 0, maybe: 1 });
  });
  it('writes the hero line', () => {
    expect(venueHeroLine(h, d => d)).toBe('Played 2 times · last 2026-09-12 · next show 2026-12-04');
    expect(venueHeroLine(summarizeVenueHistory([], today), d => d)).toMatch(/haven’t played here/);
  });
});

describe('formatting helpers', () => {
  it('formats money', () => {
    expect(money(1250.4)).toBe('$1,250');
    expect(money(0)).toBe('—');
  });
  it('builds safe website links', () => {
    expect(websiteHref('venue.com')).toBe('https://venue.com');
    expect(websiteHref('http://venue.com/')).toBe('http://venue.com/');
    expect(websiteHref('  ')).toBeNull();
    expect(websiteLabel('https://www.venue.com/')).toBe('www.venue.com');
  });
  it('builds tel links and rebook labels', () => {
    expect(telLink('(479) 555-0101')).toBe('tel:4795550101');
    expect(rebookLabel('no')).toBe('Don’t rebook');
    expect(rebookLabel(null)).toBeNull();
  });
});

describe('dealTypeLabel', () => {
  it('reads the deal_type values', () => {
    expect(dealTypeLabel('door_split')).toBe('Door split');
    expect(dealTypeLabel('guarantee')).toBe('Guarantee');
    expect(dealTypeLabel('new_kind')).toBe('new kind');
    expect(dealTypeLabel(null)).toBeNull();
  });
});
