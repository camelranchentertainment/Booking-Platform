import { parseRecommendations, summarizeForModel } from '../../lib/server/analyticsRecommendations';
import type { AnalyticsReport } from '../../lib/server/analytics';

describe('parseRecommendations', () => {
  const item = { title: 'Lean into Kansas', insight: 'Most replies came from KS.', action: 'Pitch five more KS rooms.' };

  it('reads a bare JSON array', () => {
    expect(parseRecommendations(JSON.stringify([item]))).toEqual([item]);
  });

  it('tolerates a code fence and surrounding text', () => {
    expect(parseRecommendations('Here you go:\n```json\n' + JSON.stringify([item, item]) + '\n```')).toHaveLength(2);
  });

  it('drops malformed items and keeps at most four', () => {
    const many = [item, { title: '' , insight: 'x', action: 'y' }, { nope: true }, item, item, item, item];
    expect(parseRecommendations(JSON.stringify(many))).toHaveLength(4);
  });

  it('returns [] for prose or broken JSON', () => {
    expect(parseRecommendations('I cannot help with that.')).toEqual([]);
    expect(parseRecommendations('[{"title": "x"')).toEqual([]);
  });
});

describe('summarizeForModel', () => {
  it('sends numbers only: no emails, ids or contact details', () => {
    const report = {
      year: 2026,
      pipeline: { target: 5, follow_up: 32, confirmed: 0, declined: 2, thank_you: 0, total: 39 },
      funnel: [
        { key: 'pipeline', label: 'In the pipeline', count: 39, ofPrevious: 100, ofTotal: 100 },
        { key: 'booked', label: 'Booked', count: 2, ofPrevious: 50, ofTotal: 5 },
      ],
      conversionRate: 5,
      responseRate: 9,
      regionalPerformance: [{ state: 'KS', total: 14, confirmed: 0, responded: 2, conversionRate: 0, responseRate: 14 }],
      emailPerformance: { sent: 111, received: 13, venuesEmailed: 60, venuesReplied: 6, responseRate: 9, weeks: [] },
      bookingFinancials: { year: 2026, availableYears: [2026], totalConfirmed: 33, futureConfirmedCount: 5, totalCompleted: 28, totalEarned: 12000, totalPotential: 3000, avgPay: 430, dealTypeBreakdown: {}, wouldReturnPct: 80 },
      months: Array.from({ length: 12 }, (_, month) => ({ month, played: 1, upcoming: 0, earned: 0 })),
      states: [{ state: 'MO', shows: 10, earned: 5000 }],
      topVenues: [{ venueId: 'uuid-1', name: 'Tipsy Taco', where: "Lee's Summit, MO", shows: 3, earned: 1500 }],
      tourStats: [{ id: 'uuid-t', name: 'Frost Bite', status: 'active', total: 20, contacted: 18, confirmed: 2, conversionRate: 10 }],
      generatedAt: '2026-10-28T00:00:00Z',
    } as AnalyticsReport;
    const text = summarizeForModel(report, 'Jake Stringer & Better Than Nothin');
    expect(text).toContain('Shows played: 28');
    expect(text).toContain('Tipsy Taco');
    expect(text).not.toMatch(/uuid-|@/);
  });
});
