import {
  daysBetween, nightsInWindow, isUpcomingTour, computeTourProgress,
  buildTourProgress, summarizeTours, rowsForTab,
  TourRow, TourBookingRow,
} from '../../../lib/domain/tourProgress';

const TODAY = '2026-10-13';

function tour(id: string, start: string | null, end: string | null, status = 'planning'): TourRow {
  return { id, name: id.toUpperCase(), description: null, start_date: start, end_date: end, status };
}

function bk(
  tour_id: string, status: string, show_date: string | null,
  agreed: number | null = null, actual: number | null = null,
): TourBookingRow {
  return { tour_id, status, show_date, agreed_amount: agreed, actual_amount_received: actual };
}

describe('daysBetween / nightsInWindow', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-10-13', '2026-10-16')).toBe(3);
    expect(daysBetween('2026-10-16', '2026-10-13')).toBe(-3);
  });
  it('is not thrown off by the November DST change', () => {
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });
  it('counts a window inclusively', () => {
    expect(nightsInWindow('2026-10-16', '2026-10-18')).toBe(3);
    expect(nightsInWindow('2027-02-11', '2027-02-11')).toBe(1);
  });
  it('returns null for missing or inverted dates', () => {
    expect(nightsInWindow(null, '2026-10-18')).toBeNull();
    expect(nightsInWindow('2026-10-18', null)).toBeNull();
    expect(nightsInWindow('2026-10-18', '2026-10-16')).toBeNull();
  });
});

describe('isUpcomingTour', () => {
  it('keeps runs that end today or later', () => {
    expect(isUpcomingTour(tour('a', '2026-10-10', TODAY), TODAY)).toBe(true);
  });
  it('keeps runs with no end date', () => {
    expect(isUpcomingTour(tour('a', null, null), TODAY)).toBe(true);
  });
  it('drops ended, completed and cancelled runs', () => {
    expect(isUpcomingTour(tour('a', '2026-10-01', '2026-10-12'), TODAY)).toBe(false);
    expect(isUpcomingTour(tour('a', '2026-11-01', '2026-11-03', 'completed'), TODAY)).toBe(false);
    expect(isUpcomingTour(tour('a', '2026-11-01', '2026-11-03', 'cancelled'), TODAY)).toBe(false);
  });
});

describe('computeTourProgress', () => {
  const orion = tour('orion', '2026-10-16', '2026-10-18');

  it('fills nights from booked statuses and counts pipeline separately', () => {
    const p = computeTourProgress(orion, [
      bk('orion', 'confirmed', '2026-10-16'),
      bk('orion', 'contract', '2026-10-17'),
      bk('orion', 'pitch', '2026-10-18'),
      bk('orion', 'followup', '2026-10-18'),
      bk('orion', 'hold', '2026-10-18'),
      bk('orion', 'negotiation', '2026-10-18'),
      bk('orion', 'cancelled', '2026-10-18'),
    ], TODAY);
    expect(p.nights).toBe(3);
    expect(p.filledNights).toBe(2);
    expect(p.fillPct).toBe(67);
    expect(p.pitched).toBe(2);
    expect(p.holds).toBe(2);
    expect(p.stage).toBe('pre_planning');
    expect(p.daysUntilStart).toBe(3);
    expect(p.needsDates).toBe(true);
  });

  it('counts two shows on one day as one night', () => {
    const p = computeTourProgress(orion, [
      bk('orion', 'confirmed', '2026-10-16'),
      bk('orion', 'confirmed', '2026-10-16'),
    ], TODAY);
    expect(p.filledNights).toBe(1);
    expect(p.bookedShows).toBe(2);
  });

  it('ignores shows dated outside the window so fill never passes 100%', () => {
    const p = computeTourProgress(tour('d', '2027-02-11', '2027-02-11'), [
      bk('d', 'confirmed', '2027-02-11'),
      bk('d', 'confirmed', '2027-02-12'),
    ], TODAY);
    expect(p.filledNights).toBe(1);
    expect(p.fillPct).toBe(100);
  });

  it('moves a fully filled run to advancing', () => {
    const p = computeTourProgress(tour('d', '2027-02-11', '2027-02-11'), [bk('d', 'confirmed', '2027-02-11')], TODAY);
    expect(p.stage).toBe('advancing');
    expect(p.needsDates).toBe(false);
  });

  it('marks a run in progress as on the road', () => {
    const p = computeTourProgress(tour('r', '2026-10-12', '2026-10-14'), [], TODAY);
    expect(p.stage).toBe('on_road');
    expect(p.needsDates).toBe(false);
  });

  it('does not flag runs beyond the 30-day window', () => {
    const p = computeTourProgress(tour('v', '2026-11-13', '2026-11-15'), [], TODAY);
    expect(p.daysUntilStart).toBe(31);
    expect(p.needsDates).toBe(false);
  });

  it('handles a run with no dates', () => {
    const p = computeTourProgress(tour('x', null, null), [bk('x', 'confirmed', '2026-12-01')], TODAY);
    expect(p.nights).toBeNull();
    expect(p.fillPct).toBeNull();
    expect(p.daysUntilStart).toBeNull();
    expect(p.stage).toBe('pre_planning');
  });

  it('only counts Potential on confirmed future shows and Earned on completed shows', () => {
    const p = computeTourProgress(tour('m', '2026-10-01', '2026-10-30'), [
      bk('m', 'confirmed', '2026-10-20', 500),
      bk('m', 'confirmed', '2026-10-05', 900),   // past date: not potential
      bk('m', 'advancing', '2026-10-21', 700),   // not "confirmed": not potential
      bk('m', 'completed', '2026-10-02', 400, 350),
      bk('m', 'completed', '2026-10-03', 400, '250' as unknown as number),
    ], TODAY);
    expect(p.potential).toBe(500);
    expect(p.earned).toBe(600);
  });

  it('labels completed and cancelled runs', () => {
    expect(computeTourProgress(tour('c', '2026-10-01', '2026-10-03', 'completed'), [], TODAY).stage).toBe('completed');
    expect(computeTourProgress(tour('k', '2026-10-01', '2026-10-03', 'cancelled'), [], TODAY).stage).toBe('cancelled');
  });
});

describe('summarizeTours / rowsForTab', () => {
  const tours = [
    tour('orion', '2026-10-16', '2026-10-18'),
    tour('lyra', '2026-10-30', '2026-11-01'),
    tour('dagger', '2027-02-11', '2027-02-11'),
    tour('nodates', null, null),
    tour('harrier', '2026-10-02', '2026-10-04', 'completed'),
    tour('indiana', '2026-07-29', '2026-08-02', 'cancelled'),
  ];
  const bookings = [
    bk('orion', 'confirmed', '2026-10-16'),
    bk('lyra', 'pitch', '2026-10-30'),
    bk('dagger', 'confirmed', '2027-02-11'),
    bk('harrier', 'completed', '2026-10-02', 200, 175),
    bk(null as unknown as string, 'confirmed', '2026-10-20'),
  ];
  const rows = buildTourProgress(tours, bookings, TODAY);
  const s = summarizeTours(rows);

  it('rolls up nights across upcoming runs with a date window', () => {
    expect(s.upcomingCount).toBe(4);
    expect(s.pastCount).toBe(2);
    expect(s.totalNights).toBe(7);
    expect(s.filledNights).toBe(2);
    expect(s.openNights).toBe(5);
    expect(s.fillPct).toBe(29);
    expect(s.emptyRuns).toBe(1);
    expect(s.pitched).toBe(1);
  });

  it('counts stages', () => {
    expect(s.stageCounts).toEqual({ pre_planning: 3, advancing: 1, on_road: 0, completed: 1 });
  });

  it('picks the soonest run that has not started', () => {
    expect(s.nextOut?.tour.id).toBe('orion');
  });

  it('orders each tab', () => {
    expect(rowsForTab(rows, 'upcoming').map(r => r.tour.id)).toEqual(['orion', 'lyra', 'dagger', 'nodates']);
    expect(rowsForTab(rows, 'past').map(r => r.tour.id)).toEqual(['harrier', 'indiana']);
    expect(rowsForTab(rows, 'all')).toHaveLength(6);
  });

  it('handles no tours', () => {
    const empty = summarizeTours([]);
    expect(empty.fillPct).toBe(0);
    expect(empty.nextOut).toBeNull();
  });
});
