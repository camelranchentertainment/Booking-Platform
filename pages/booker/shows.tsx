// pages/booker/shows.tsx
// Every show the agent has booked, filterable by band, status and time range.

import { useMemo, useState } from 'react';
import BookerShell from '../../components/booker/BookerShell';
import ShowRow from '../../components/booker/ShowRow';
import { ShowForm } from '../../components/booker/forms';
import { EmptyState, ErrorBanner, PageHeader, SkeletonRows } from '../../components/booker/ui';
import { listRoster, listShows, listVenues } from '../../lib/booker/data';
import { formatShowDate, todayIso } from '../../lib/booker/dates';
import { byId, findConflicts, venueLabel } from '../../lib/booker/workspace';
import { useLoad } from '../../lib/booker/useLoad';
import { SHOW_STATUSES, SHOW_STATUS_LABEL, type BookerShow, type ShowStatus } from '../../lib/booker/types';

type Range = 'upcoming' | 'past' | 'all';

function ShowsContent() {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const { data, loading, error, reload } = useLoad(async () => {
    const [bands, venues, shows] = await Promise.all([listRoster(), listVenues(), listShows()]);
    return { bands, venues, shows };
  });
  const [range, setRange] = useState<Range>('upcoming');
  const [bandFilter, setBandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<ShowStatus | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<BookerShow | 'new' | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const bandsById = byId(data.bands);
    const venuesById = byId(data.venues);
    const q = search.trim().toLowerCase();
    let shows = data.shows.filter(s => {
      if (range === 'upcoming' && s.show_date < today) return false;
      if (range === 'past' && s.show_date >= today) return false;
      if (bandFilter && s.roster_id !== bandFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (q) {
        const hay = `${bandsById.get(s.roster_id)?.band_name ?? ''} ${venueLabel(s, venuesById)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (range !== 'upcoming') shows = [...shows].reverse();
    return { bandsById, venuesById, shows };
  }, [data, range, bandFilter, statusFilter, search, today]);

  const onSaved = () => {
    setEditing(null);
    void reload();
  };

  return (
    <>
      <PageHeader
        title="Shows"
        sub={view ? `${view.shows.length} shown` : undefined}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} disabled={!data || data.bands.length === 0}>
            + Add show
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <SkeletonRows rows={6} />}

      {data && data.bands.length === 0 && (
        <EmptyState title="Add a band first" body="Shows belong to a band on your roster. Add a band, then book their shows here." />
      )}

      {data && view && data.bands.length > 0 && (
        <>
          <div role="search" className="card mb-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', padding: '0.9rem' }}>
            <div className="field">
              <label className="field-label" htmlFor="f-range">
                When
              </label>
              <select id="f-range" className="select" value={range} onChange={e => setRange(e.target.value as Range)}>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="f-band">
                Band
              </label>
              <select id="f-band" className="select" value={bandFilter} onChange={e => setBandFilter(e.target.value)}>
                <option value="">All bands</option>
                {data.bands.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.band_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="f-status">
                Status
              </label>
              <select id="f-status" className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value as ShowStatus | '')}>
                <option value="">Any status</option>
                {SHOW_STATUSES.map(s => (
                  <option key={s} value={s}>
                    {SHOW_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="f-search">
                Search
              </label>
              <input id="f-search" className="input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Band or venue" />
            </div>
          </div>

          {view.shows.length === 0 ? (
            <p className="text-sm text-muted">No shows match these filters.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {view.shows.map(s => (
                <ShowRow key={s.id} show={s} band={view.bandsById.get(s.roster_id)} venuesById={view.venuesById} onOpen={setEditing} currentYear={year} />
              ))}
            </div>
          )}
          <p className="text-xs text-muted" style={{ marginTop: '1rem' }}>
            Today is {formatShowDate(today, year)}.
          </p>
        </>
      )}

      {editing && data && (
        <ShowForm
          show={editing === 'new' ? undefined : editing}
          bands={data.bands}
          venues={data.venues}
          defaultBandId={bandFilter || undefined}
          conflictsFor={(id, date, excludeId) => findConflicts(data.shows, id, date, excludeId)}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onArchived={onSaved}
        />
      )}
    </>
  );
}

export default function BookerShows() {
  return (
    <BookerShell title="Shows">
      <ShowsContent />
    </BookerShell>
  );
}
