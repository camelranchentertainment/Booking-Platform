// pages/booker/bands/index.tsx
// The agent's roster: every band they carry, with rate and upcoming work.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import BookerShell from '../../../components/booker/BookerShell';
import { RosterBandForm } from '../../../components/booker/forms';
import { BandDot, EmptyState, ErrorBanner, PageHeader, SkeletonRows } from '../../../components/booker/ui';
import { listRoster, listShows } from '../../../lib/booker/data';
import { todayIso } from '../../../lib/booker/dates';
import { tierForBandCount, bandsUntilNextTier } from '../../../lib/booker/pricing';
import { useLoad } from '../../../lib/booker/useLoad';

function BandsContent() {
  const today = todayIso();
  const { data, loading, error, reload } = useLoad(async () => {
    const [bands, shows] = await Promise.all([listRoster(), listShows({ from: today })]);
    return { bands, shows };
  }, today);
  const [adding, setAdding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.bands
      .filter(b => showInactive || b.status === 'active')
      .map(b => {
        const upcoming = data.shows.filter(s => s.roster_id === b.id && s.status !== 'cancelled');
        return {
          band: b,
          booked: upcoming.filter(s => s.status === 'confirmed').length,
          holds: upcoming.filter(s => s.status === 'hold' || s.status === 'pending').length,
        };
      });
  }, [data, showInactive]);

  const activeCount = data?.bands.filter(b => b.status === 'active').length ?? 0;
  const tier = tierForBandCount(activeCount);
  const untilNext = bandsUntilNextTier(activeCount);

  return (
    <>
      <PageHeader
        title="Bands"
        sub={data ? `${activeCount} active` : undefined}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            + Add band
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <SkeletonRows />}

      {data && data.bands.length === 0 && (
        <EmptyState
          title="No bands yet"
          body="Add the acts you book. Bands don't need their own account to be on your roster."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              + Add a band
            </button>
          }
        />
      )}

      {data && data.bands.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <label className="text-sm text-muted" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Show inactive bands
            </label>
            <span className="text-xs text-muted">
              {tier.label} plan{tier.monthlyUsd !== null ? ` · $${tier.monthlyUsd}/mo` : ' · custom pricing'}
              {untilNext !== null && untilNext <= 3 ? ` · ${untilNext} more band${untilNext === 1 ? '' : 's'} moves you to the next tier` : ''}
            </span>
          </div>
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Band</th>
                  <th scope="col">Home</th>
                  <th scope="col">Commission</th>
                  <th scope="col">Booked</th>
                  <th scope="col">Holds</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ band, booked, holds }) => (
                  <tr key={band.id}>
                    <td>
                      <Link href={`/booker/bands/${band.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontWeight: 800 }}>
                        <BandDot color={band.color} />
                        {band.band_name}
                      </Link>
                    </td>
                    <td>{[band.home_city, band.home_state].filter(Boolean).join(', ') || '—'}</td>
                    <td>{band.commission_pct === null ? <span style={{ color: '#fbbf24' }}>Not set</span> : `${band.commission_pct}%`}</td>
                    <td>{booked}</td>
                    <td>{holds}</td>
                    <td>
                      <span className={`badge ${band.status === 'active' ? 'badge-confirmed' : 'badge-completed'}`}>{band.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {adding && (
        <RosterBandForm
          colorIndex={data?.bands.length ?? 0}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

export default function BookerBands() {
  return (
    <BookerShell title="Bands">
      <BandsContent />
    </BookerShell>
  );
}
