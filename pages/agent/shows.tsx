// pages/agent/shows.tsx
// Every show the agent has booked, in the Tours page style: illustrated hero,
// four metric trackers, Upcoming / Holds / Past / All tabs, band / status /
// search filters, and the shows grouped under date headings. The Holds tab
// lists open holds and offers most-urgent first (challenge deadlines and
// expiring holds on top). Counting lives in lib/booker/summary.ts and
// lib/booker/holds.ts (unit-tested).

import { useMemo, useState } from 'react';
import BookerShell from '../../components/booker/BookerShell';
import RouteMapScene from '../../components/booker/RouteMapScene';
import ShowRow from '../../components/booker/ShowRow';
import { ShowForm } from '../../components/booker/forms';
import PageHero from '../../components/layout/PageHero';
import { listRoster, listShows, listVenues } from '../../lib/booker/data';
import { formatShowDate, todayIso } from '../../lib/booker/dates';
import { groupInOrder, plural, showTabCounts, showsForTab, showsSummary, type ShowTab } from '../../lib/booker/summary';
import { byId, findConflicts, venueLabel } from '../../lib/booker/workspace';
import { holdCounts, holdsByUrgency } from '../../lib/booker/holds';
import { useLoad } from '../../lib/booker/useLoad';
import { handoffChip, latestProposalByShow } from '../../lib/booker/handoff';
import { listBandProposals } from '../../lib/booker/handoffData';
import { SHOW_STATUSES, SHOW_STATUS_LABEL, type BookerShow, type ShowStatus } from '../../lib/booker/types';

/** Time tabs plus Holds, which lists open holds and offers by urgency. */
type Tab = ShowTab | 'holds';
const TAB_LABELS: Readonly<Record<Tab, string>> = { upcoming: 'Upcoming', holds: 'Holds', past: 'Past', all: 'All' };
const TAB_ORDER: readonly Tab[] = ['upcoming', 'holds', 'past', 'all'];

function ShowsContent() {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const { data, loading, error, reload } = useLoad(async () => {
    const [bands, venues, shows, proposals] = await Promise.all([
      listRoster(),
      listVenues(),
      listShows(),
      // Hand-off chips are extra: if they can't load, the list still shows.
      listBandProposals().catch(() => []),
    ]);
    return { bands, venues, shows, handoffByShow: latestProposalByShow(proposals) };
  });
  const [tab, setTab] = useState<Tab>('upcoming');
  const [bandFilter, setBandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<ShowStatus | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<BookerShow | 'new' | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const bandsById = byId(data.bands);
    const venuesById = byId(data.venues);
    const q = search.trim().toLowerCase();
    const base = tab === 'holds' ? holdsByUrgency(data.shows, today) : showsForTab(data.shows, tab, today);
    const filtered = base.filter(s => {
      if (bandFilter && s.roster_id !== bandFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (q) {
        const hay = `${bandsById.get(s.roster_id)?.band_name ?? ''} ${venueLabel(s, venuesById)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const holds = holdCounts(data.shows, today);
    const counts: Record<Tab, number> = { ...showTabCounts(data.shows, today), holds: holds.open };
    return {
      bandsById,
      venuesById,
      filtered,
      groups: groupInOrder(filtered),
      holds,
      counts,
      summary: showsSummary(data.shows, today),
    };
  }, [data, tab, bandFilter, statusFilter, search, today]);

  const filtersOn = Boolean(bandFilter || statusFilter || search.trim());
  const clearFilters = () => {
    setBandFilter('');
    setStatusFilter('');
    setSearch('');
  };
  const onSaved = () => {
    setEditing(null);
    void reload();
  };

  const hasBands = Boolean(data && data.bands.length > 0);
  const heroSummary = view && hasBands
    ? `${plural(view.summary.booked, 'upcoming show')} · ${plural(view.summary.inPlay, 'hold')} in play${view.summary.toSettle > 0 ? ` · ${view.summary.toSettle} to settle` : ''}.`
    : undefined;

  return (
    <>
      <PageHero
        title="Shows"
        subtitle="Every date across your roster"
        summary={heroSummary}
        scene={<RouteMapScene />}
        actions={
          <button type="button" className="btn btn-primary tours-new-btn" onClick={() => setEditing('new')} disabled={!hasBands}>
            + Add show
          </button>
        }
      />

      {error && (
        <div className="card tours-empty" role="alert">
          <div className="tours-empty-title">Shows didn’t load</div>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      )}

      {loading && !data && !error && (
        <div className="tours-body" aria-busy="true">
          <span className="sr-only" role="status">
            Loading shows…
          </span>
          <div className="tours-metrics">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="tour-metric tour-skeleton" />
            ))}
          </div>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="tour-skeleton" style={{ height: 52, borderRadius: 'var(--radius-sm)' }} />
          ))}
        </div>
      )}

      {data && !hasBands && (
        <div className="card tours-empty">
          <div className="tours-empty-title">Add a band first</div>
          <p>Shows belong to a band on your roster. Add a band, then book their shows here.</p>
        </div>
      )}

      {data && view && hasBands && (
        <div className="tours-body">
          <section className="tours-metrics" aria-label="Shows at a glance">
            <div className="tour-metric">
              <span className="tour-metric-label">Upcoming Shows</span>
              <div className="tour-metric-value">
                <strong>{view.summary.booked}</strong>
                <span>confirmed</span>
              </div>
              <span className="tour-metric-note">Today and later</span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">In play</span>
              <div className="tour-metric-value">
                <strong className={view.holds.challenged + view.holds.expiring > 0 ? 'tour-metric-hot' : undefined}>{view.summary.inPlay}</strong>
                <span>holds &amp; offers</span>
              </div>
              <span className="tour-metric-note">
                {view.holds.challenged + view.holds.expiring > 0
                  ? [view.holds.challenged > 0 ? `${view.holds.challenged} challenged` : null, view.holds.expiring > 0 ? `${view.holds.expiring} expiring soon` : null].filter(Boolean).join(' · ')
                  : 'Waiting on a venue’s answer'}
              </span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">To settle</span>
              <div className="tour-metric-value">
                <strong className={view.summary.toSettle > 0 ? 'tour-metric-hot' : undefined}>{view.summary.toSettle}</strong>
                <span>past confirmed</span>
              </div>
              <span className="tour-metric-note">{view.summary.toSettle > 0 ? 'Mark them Played to track commission' : 'Every past show is settled'}</span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Played in {year}</span>
              <div className="tour-metric-value">
                <strong>{view.summary.playedThisYear}</strong>
                <span>{view.summary.playedThisYear === 1 ? 'show' : 'shows'}</span>
              </div>
              <span className="tour-metric-note">Calendar year to date</span>
            </div>
          </section>

          <div className="tours-toolbar">
            <div className="tours-tabs" role="group" aria-label="Show dates">
              {TAB_ORDER.map(t => (
                <button key={t} type="button" className={`tours-tab${tab === t ? ' tours-tab--on' : ''}`} aria-pressed={tab === t} onClick={() => setTab(t)}>
                  {TAB_LABELS[t]} · {view.counts[t]}
                </button>
              ))}
            </div>
            <span className="tours-sort-note">{tab === 'upcoming' ? 'Soonest first' : tab === 'holds' ? 'Most urgent first' : 'Most recent first'}</span>
          </div>

          <div role="search" className="agent-filters" aria-label="Filter shows">
            <label className="sr-only" htmlFor="f-band">
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
            <label className="sr-only" htmlFor="f-status">
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
            <label className="sr-only" htmlFor="f-search">
              Search band or venue
            </label>
            <input id="f-search" className="input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search band or venue" />
            {filtersOn && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>

          {view.groups.length === 0 ? (
            <div className="card tours-empty">
              <div className="tours-empty-title">{filtersOn ? 'No shows match' : tab === 'upcoming' ? 'Nothing upcoming' : tab === 'holds' ? 'No holds out' : 'No past shows yet'}</div>
              {filtersOn ? (
                <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : (
                (tab === 'upcoming' || tab === 'holds') && (
                  <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
                    + Add show
                  </button>
                )
              )}
            </div>
          ) : (
            tab === 'holds' ? (
              <section className="agent-day" aria-label={`Holds and offers, most urgent first, ${plural(view.filtered.length, 'show')}`}>
                {view.filtered.map(s => (
                  <ShowRow key={s.id} show={s} band={view.bandsById.get(s.roster_id)} venuesById={view.venuesById} onOpen={setEditing} currentYear={year} handoff={handoffChip(data.handoffByShow.get(s.id))} />
                ))}
              </section>
            ) : (
            <section className="agent-days" aria-label={`${TAB_LABELS[tab]} shows, ${plural(view.filtered.length, 'show')}`}>
              {view.groups.map(g => (
                <div key={g.date} className="agent-day">
                  <h2 className={`agent-day-label${g.date === today ? ' agent-day-label--today' : ''}`}>{g.date === today ? `Today · ${formatShowDate(g.date, year)}` : formatShowDate(g.date, year)}</h2>
                  {g.shows.map(s => (
                    <ShowRow key={s.id} show={s} band={view.bandsById.get(s.roster_id)} venuesById={view.venuesById} onOpen={setEditing} hideDate currentYear={year} handoff={handoffChip(data.handoffByShow.get(s.id))} />
                  ))}
                </div>
              ))}
            </section>
            )
          )}
        </div>
      )}

      {editing && data && (
        <ShowForm
          show={editing === 'new' ? undefined : editing}
          bands={data.bands}
          venues={data.venues}
          defaultBandId={bandFilter || undefined}
          conflictsFor={(id, date, excludeId) => findConflicts(data.shows, id, date, excludeId)}
          otherShows={data.shows}
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
