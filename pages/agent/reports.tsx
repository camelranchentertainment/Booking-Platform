// pages/agent/reports.tsx
// Reports (build list item 5): a calendar year's shows grouped by band, town,
// venue or talent buyer, with earned gross and commission, plus the venues
// that book the agent's bands back. Each table downloads as a CSV.
//
// All data is read through the agent's own RLS-scoped queries (listShows,
// listRoster, listVenues, listOffers), so nothing here can reach another
// agent's records. The CSV is built in the browser; nothing is uploaded.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import BookerShell from '../../components/booker/BookerShell';
import { EmptyState, ErrorBanner, SkeletonRows } from '../../components/booker/ui';
import RouteMapScene from '../../components/booker/RouteMapScene';
import PageHero from '../../components/layout/PageHero';
import { plural } from '../../lib/booker/summary';
import { listRoster, listShows, listVenues } from '../../lib/booker/data';
import { listOffers } from '../../lib/booker/offerData';
import { formatShowDate, todayIso } from '../../lib/booker/dates';
import { formatMoney, repeatShowIds } from '../../lib/booker/commission';
import { byId } from '../../lib/booker/workspace';
import { useLoad } from '../../lib/booker/useLoad';
import { REPORT_GROUPS, REPORT_GROUP_LABEL, bookBacks, buyerByShow, reportRows, reportTotals, toCsv, type ReportGroup } from '../../lib/booker/reports';

/** Supabase returns at most 1,000 rows per request; reports only need the buyer names. */
const OFFER_LIMIT = 1000;

const GROUP_HEADING: Record<ReportGroup, string> = { band: 'Band', city: 'Town', venue: 'Venue', buyer: 'Talent buyer' };

/** Saves text as a CSV file in the browser. A byte-order mark keeps Excel reading accents correctly. */
function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Let the click start the download before the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportsContent() {
  const today = todayIso();
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [group, setGroup] = useState<ReportGroup>('band');
  const { data, loading, error, reload } = useLoad(async () => {
    const [bands, venues, shows, offers] = await Promise.all([listRoster(), listVenues(), listShows(), listOffers({ limit: OFFER_LIMIT })]);
    return { bands, venues, shows, offers };
  });

  const base = useMemo(() => {
    if (!data) return null;
    const venuesById = byId(data.venues);
    return {
      venuesById,
      buyers: buyerByShow(data.offers),
      repeats: repeatShowIds(data.shows),
      backs: bookBacks(data.shows, venuesById, today),
      years: Array.from(new Set([currentYear, ...data.shows.map(s => Number(s.show_date.slice(0, 4)))]))
        .filter(Number.isFinite)
        .sort((a, b) => b - a),
    };
  }, [data, today, currentYear]);

  const rows = useMemo(() => {
    if (!data || !base) return [];
    return reportRows({ shows: data.shows, bands: data.bands, venuesById: base.venuesById, buyers: base.buyers, group, year, today, repeats: base.repeats });
  }, [data, base, group, year, today]);
  const totals = useMemo(() => reportTotals(rows), [rows]);

  const exportReport = () => {
    const header = [GROUP_HEADING[group], 'Played', 'Earned gross', 'Commission earned', 'Confirmed to come', 'Agreed fees to come', 'Commission projected', 'Last played'];
    const body = rows.map(r => [r.label, r.played, r.gross.toFixed(2), r.commission.toFixed(2), r.upcoming, r.upcomingGross.toFixed(2), r.projectedCommission.toFixed(2), r.lastPlayed]);
    body.push(['Total', totals.played, totals.gross.toFixed(2), totals.commission.toFixed(2), totals.upcoming, totals.upcomingGross.toFixed(2), totals.projectedCommission.toFixed(2), null]);
    downloadCsv(`report-${year}-${group}.csv`, toCsv(header, body));
  };

  const exportBookBacks = () => {
    if (!base) return;
    const header = ['Venue', 'Times played', 'Bands', 'Years', 'First played', 'Last played', 'Average gross', 'Next date'];
    const body = base.backs.map(b => [b.label, b.timesPlayed, b.bands, b.years, b.firstPlayed, b.lastPlayed, b.averageGross?.toFixed(2) ?? null, b.nextDate]);
    downloadCsv(`venues-that-book-back-${today}.csv`, toCsv(header, body));
  };

  return (
    <>
      <PageHero
        title="Reports"
        subtitle={`Calendar year ${year}`}
        summary={
          data
            ? totals.played > 0
              ? `${plural(totals.played, 'show')} played in ${year}, ${formatMoney(totals.gross)} gross, ${formatMoney(totals.commission)} commission.`
              : `No shows played in ${year} yet.`
            : undefined
        }
        scene={<RouteMapScene />}
      />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <SkeletonRows />}

      {data && base && (
        <div className="tours-body">
          <div className="tours-toolbar" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            {base.years.length > 1 && (
              <div className="tours-tabs" role="group" aria-label="Calendar year">
                {base.years.map(y => (
                  <button key={y} type="button" className={`tours-tab${year === y ? ' tours-tab--on' : ''}`} aria-pressed={year === y} onClick={() => setYear(y)}>
                    {y}
                  </button>
                ))}
              </div>
            )}
            <div className="tours-tabs" role="group" aria-label="Group shows">
              {REPORT_GROUPS.map(g => (
                <button key={g} type="button" className={`tours-tab${group === g ? ' tours-tab--on' : ''}`} aria-pressed={group === g} onClick={() => setGroup(g)}>
                  {REPORT_GROUP_LABEL[g]}
                </button>
              ))}
            </div>
          </div>

          <section aria-labelledby="report-h" className="mb-6">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <h2 id="report-h" className="agent-section-title" style={{ margin: 0 }}>
                {REPORT_GROUP_LABEL[group]}, {year}
              </h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={exportReport} disabled={rows.length === 0}>
                Download CSV
              </button>
            </div>
            {rows.length === 0 ? (
              <EmptyState title={`Nothing to report for ${year}`} body="Reports count shows marked Played, and confirmed shows still to come. Holds and cancelled dates are left out." />
            ) : (
              <div className="card table-wrap" style={{ padding: 0 }}>
                <table>
                  <caption className="sr-only">
                    {REPORT_GROUP_LABEL[group]} for {year}: played shows, earned gross and commission, and confirmed shows still to come
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{GROUP_HEADING[group]}</th>
                      <th scope="col">Played</th>
                      <th scope="col">Gross</th>
                      <th scope="col">Commission</th>
                      <th scope="col">To come</th>
                      <th scope="col">Projected</th>
                      <th scope="col">Last played</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.key}>
                        <td style={{ color: 'var(--text)', fontWeight: 600 }}>
                          {r.label}
                        </td>
                        <td>{r.played}</td>
                        <td>{formatMoney(r.gross)}</td>
                        <td>{formatMoney(r.commission)}</td>
                        <td>{r.upcoming > 0 ? `${r.upcoming} · ${formatMoney(r.upcomingGross)}` : '—'}</td>
                        <td>{formatMoney(r.projectedCommission)}</td>
                        <td>{r.lastPlayed ? formatShowDate(r.lastPlayed, currentYear) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ color: 'var(--text)', fontWeight: 700 }}>Total</td>
                      <td>{totals.played}</td>
                      <td>{formatMoney(totals.gross)}</td>
                      <td>{formatMoney(totals.commission)}</td>
                      <td>{totals.upcoming > 0 ? `${totals.upcoming} · ${formatMoney(totals.upcomingGross)}` : '—'}</td>
                      <td>{formatMoney(totals.projectedCommission)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="text-xs text-muted" style={{ marginTop: '0.5rem' }}>
              Gross is the amount received when entered, else the agreed fee. {group === 'buyer' && 'The talent buyer comes from the show’s accepted offer, else the last one sent.'}
            </p>
          </section>

          <section aria-labelledby="backs-h">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <h2 id="backs-h" className="agent-section-title" style={{ margin: 0 }}>
                Venues that book you back
              </h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={exportBookBacks} disabled={base.backs.length === 0}>
                Download CSV
              </button>
            </div>
            {base.backs.length === 0 ? (
              <EmptyState title="No repeat venues yet" body="A venue shows here once your bands have played it twice. All years count." />
            ) : (
              <div className="card table-wrap" style={{ padding: 0 }}>
                <table>
                  <caption className="sr-only">Venues with two or more played shows, all years</caption>
                  <thead>
                    <tr>
                      <th scope="col">Venue</th>
                      <th scope="col">Played</th>
                      <th scope="col">Bands</th>
                      <th scope="col">First</th>
                      <th scope="col">Last</th>
                      <th scope="col">Average gross</th>
                      <th scope="col">Next date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {base.backs.map(b => (
                      <tr key={b.key}>
                        <td style={{ color: 'var(--text)', fontWeight: 600 }}>
                          {b.venueId ? <Link href={`/agent/venues/${b.venueId}`}>{b.label}</Link> : b.label}
                        </td>
                        <td>
                          {b.timesPlayed}
                          {b.years > 1 && <span className="text-xs text-muted"> · {plural(b.years, 'year')}</span>}
                        </td>
                        <td>{b.bands}</td>
                        <td>{formatShowDate(b.firstPlayed, currentYear)}</td>
                        <td>{formatShowDate(b.lastPlayed, currentYear)}</td>
                        <td>{formatMoney(b.averageGross)}</td>
                        <td>{b.nextDate ? formatShowDate(b.nextDate, currentYear) : <span className="text-muted">None booked</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

/** Reports page in the agent workspace. */
export default function ReportsPage() {
  return (
    <BookerShell title="Reports">
      <ReportsContent />
    </BookerShell>
  );
}
