// pages/booker/commission.tsx
// Commission ledger: what each band owes the agent for a calendar year, and the
// payments received. Totals are always scoped to one selected year.

import { useMemo, useState } from 'react';
import BookerShell from '../../components/booker/BookerShell';
import { PaymentForm } from '../../components/booker/forms';
import { BandDot, EmptyState, ErrorBanner, PageHeader, SkeletonRows } from '../../components/booker/ui';
import { archivePayment, listPayments, listRoster, listShows, listVenues } from '../../lib/booker/data';
import { formatShowDate, todayIso, yearRange } from '../../lib/booker/dates';
import { commissionDue, commissionTotals, formatMoney, paidForShow, toAmount } from '../../lib/booker/commission';
import { byId, payableShows, venueLabel } from '../../lib/booker/workspace';
import { useLoad } from '../../lib/booker/useLoad';
import { PAYMENT_METHOD_LABEL } from '../../lib/booker/types';

function CommissionContent() {
  const today = todayIso();
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const { data, loading, error, reload } = useLoad(async () => {
    const [bands, venues, shows, payments] = await Promise.all([listRoster(), listVenues(), listShows(), listPayments()]);
    return { bands, venues, shows, payments };
  });
  const [recording, setRecording] = useState<{ showId?: string; amount?: number } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const view = useMemo(() => {
    if (!data) return null;
    const bandsById = byId(data.bands);
    const venuesById = byId(data.venues);
    const { start, end } = yearRange(year);
    const yearShows = data.shows.filter(s => s.show_date >= start && s.show_date <= end);
    const showIds = new Set(yearShows.map(s => s.id));
    const yearPayments = data.payments.filter(p => showIds.has(p.show_id));
    const totals = commissionTotals(yearShows, bandsById, yearPayments, today);
    const perBand = data.bands
      .map(b => ({ band: b, totals: commissionTotals(yearShows.filter(s => s.roster_id === b.id), bandsById, yearPayments, today) }))
      .filter(r => r.totals.due > 0 || r.totals.projected > 0 || r.totals.paid > 0);
    const played = yearShows
      .filter(s => s.status === 'played')
      .sort((a, b) => b.show_date.localeCompare(a.show_date))
      .map(s => {
        const due = commissionDue(s, bandsById.get(s.roster_id));
        const paid = paidForShow(s.id, yearPayments);
        return { show: s, due, paid, owed: Math.max(0, Math.round((due - paid) * 100) / 100) };
      });
    const years = Array.from(new Set([currentYear, ...data.shows.map(s => Number(s.show_date.slice(0, 4)))])).sort((a, b) => b - a);
    return { bandsById, venuesById, totals, perBand, played, yearPayments, years, payOptions: payableShows(yearShows, bandsById, venuesById) };
  }, [data, year, currentYear, today]);

  const removePayment = async (id: string) => {
    setActionError('');
    try {
      await archivePayment(id);
      setConfirmId(null);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove the payment.');
    }
  };

  return (
    <>
      <PageHeader
        title="Commission"
        sub={`Calendar year ${year}`}
        actions={
          <>
            <label htmlFor="c-year" style={{ position: 'absolute', left: -9999 }}>
              Year
            </label>
            <select id="c-year" className="select" style={{ width: 'auto' }} value={year} onChange={e => setYear(Number(e.target.value))}>
              {(view?.years ?? [currentYear]).map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary" onClick={() => setRecording({})} disabled={!view || view.payOptions.length === 0}>
              + Record payment
            </button>
          </>
        }
      />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {actionError && <ErrorBanner message={actionError} />}
      {loading && !data && <SkeletonRows />}

      {view && (
        <>
          <div className="grid-4 mb-6">
            <div className="card stat-block">
              <div className="stat-value">{formatMoney(view.totals.due)}</div>
              <div className="stat-label">Earned</div>
            </div>
            <div className="card stat-block">
              <div className="stat-value">{formatMoney(view.totals.paid)}</div>
              <div className="stat-label">Received</div>
            </div>
            <div className="card stat-block">
              <div className="stat-value" style={{ color: view.totals.outstanding > 0 ? '#fbbf24' : undefined }}>
                {formatMoney(view.totals.outstanding)}
              </div>
              <div className="stat-label">Owed to you</div>
            </div>
            <div className="card stat-block">
              <div className="stat-value">{formatMoney(view.totals.projected)}</div>
              <div className="stat-label">Projected (confirmed)</div>
            </div>
          </div>
          <p className="text-xs text-muted" style={{ marginTop: '-0.75rem', marginBottom: '1.5rem' }}>
            Earned counts played shows, on the amount the band actually received when you have entered it, otherwise on the agreed fee.
          </p>

          {view.perBand.length === 0 && view.played.length === 0 ? (
            <EmptyState
              title={`No commission for ${year} yet`}
              body="Commission appears once a show is marked Played and its band has a rate. Confirmed shows count toward Projected."
            />
          ) : (
            <>
              <section aria-labelledby="by-band-h" className="mb-6">
                <h2 id="by-band-h" className="display" style={{ fontSize: '1.6rem', margin: '0 0 0.75rem' }}>
                  By band
                </h2>
                <div className="card table-wrap" style={{ padding: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Band</th>
                        <th scope="col">Rate</th>
                        <th scope="col">Earned</th>
                        <th scope="col">Received</th>
                        <th scope="col">Owed</th>
                        <th scope="col">Projected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.perBand.map(({ band, totals }) => (
                        <tr key={band.id}>
                          <td style={{ color: 'var(--text)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <BandDot color={band.color} />
                              {band.band_name}
                            </span>
                          </td>
                          <td>{band.commission_pct === null ? '—' : `${band.commission_pct}%`}</td>
                          <td>{formatMoney(totals.due)}</td>
                          <td>{formatMoney(totals.paid)}</td>
                          <td style={{ color: totals.outstanding > 0 ? '#fbbf24' : undefined }}>{formatMoney(totals.outstanding)}</td>
                          <td>{formatMoney(totals.projected)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section aria-labelledby="played-h" className="mb-6">
                <h2 id="played-h" className="display" style={{ fontSize: '1.6rem', margin: '0 0 0.75rem' }}>
                  Played shows
                </h2>
                <div className="card table-wrap" style={{ padding: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Band</th>
                        <th scope="col">Venue</th>
                        <th scope="col">Basis</th>
                        <th scope="col">Due</th>
                        <th scope="col">Paid</th>
                        <th scope="col">Owed</th>
                        <th scope="col">
                          <span style={{ position: 'absolute', left: -9999 }}>Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.played.map(({ show, due, paid, owed }) => (
                        <tr key={show.id}>
                          <td>{formatShowDate(show.show_date, currentYear)}</td>
                          <td style={{ color: 'var(--text)' }}>{view.bandsById.get(show.roster_id)?.band_name ?? '—'}</td>
                          <td>{venueLabel(show, view.venuesById)}</td>
                          <td>{formatMoney(toAmount(show.actual_amount) ?? toAmount(show.fee))}</td>
                          <td>{formatMoney(due)}</td>
                          <td>{formatMoney(paid)}</td>
                          <td style={{ color: owed > 0 ? '#fbbf24' : undefined }}>{formatMoney(owed)}</td>
                          <td style={{ textAlign: 'right' }}>
                            {owed > 0 && (
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRecording({ showId: show.id, amount: owed })}>
                                Record payment
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {view.played.length === 0 && <div className="table-empty">No shows marked Played in {year}.</div>}
                </div>
              </section>

              <section aria-labelledby="payments-h">
                <h2 id="payments-h" className="display" style={{ fontSize: '1.6rem', margin: '0 0 0.75rem' }}>
                  Payments received
                </h2>
                <div className="card table-wrap" style={{ padding: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Paid on</th>
                        <th scope="col">Band</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Method</th>
                        <th scope="col">Notes</th>
                        <th scope="col">
                          <span style={{ position: 'absolute', left: -9999 }}>Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.yearPayments.map(p => {
                        const show = data?.shows.find(s => s.id === p.show_id);
                        return (
                          <tr key={p.id}>
                            <td>{formatShowDate(p.paid_on, currentYear)}</td>
                            <td style={{ color: 'var(--text)' }}>{show ? view.bandsById.get(show.roster_id)?.band_name : '—'}</td>
                            <td>{formatMoney(toAmount(p.amount))}</td>
                            <td>{PAYMENT_METHOD_LABEL[p.method]}</td>
                            <td>{p.notes ?? ''}</td>
                            <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                              {confirmId === p.id ? (
                                <>
                                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removePayment(p.id)}>
                                    Remove
                                  </button>{' '}
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>
                                    Keep
                                  </button>
                                </>
                              ) : (
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(p.id)} aria-label="Remove this payment">
                                  Remove
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {view.yearPayments.length === 0 && <div className="table-empty">No payments recorded for {year} shows.</div>}
                </div>
              </section>
            </>
          )}
        </>
      )}

      {recording && view && (
        <PaymentForm
          showOptions={view.payOptions}
          defaultShowId={recording.showId}
          defaultAmount={recording.amount}
          onClose={() => setRecording(null)}
          onSaved={() => {
            setRecording(null);
            void reload();
          }}
        />
      )}
    </>
  );
}

export default function BookerCommission() {
  return (
    <BookerShell title="Commission">
      <CommissionContent />
    </BookerShell>
  );
}
