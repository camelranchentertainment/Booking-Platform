// pages/booker/bands/index.tsx
// The agent's roster, in the Tours page style: illustrated hero, four metric
// trackers, Active / Inactive / All tabs and a grid of band cards. Counting
// lives in lib/booker/summary.ts (unit-tested).

import { useMemo, useState } from 'react';
import BookerShell from '../../../components/booker/BookerShell';
import BandCard from '../../../components/booker/BandCard';
import RouteMapScene from '../../../components/booker/RouteMapScene';
import { RosterBandForm } from '../../../components/booker/forms';
import PageHero from '../../../components/layout/PageHero';
import { listRoster, listShows, listVenues } from '../../../lib/booker/data';
import { todayIso } from '../../../lib/booker/dates';
import { bandsUntilNextTier, tierForBandCount } from '../../../lib/booker/pricing';
import { bandCards, bandsForTab, plural, rosterSummary, rosterTabCounts, type RosterTab } from '../../../lib/booker/summary';
import { byId } from '../../../lib/booker/workspace';
import { useLoad } from '../../../lib/booker/useLoad';

const TAB_LABELS: Readonly<Record<RosterTab, string>> = { active: 'Active', inactive: 'Inactive', all: 'All' };

function BandsContent() {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const { data, loading, error, reload } = useLoad(async () => {
    const [bands, shows, venues] = await Promise.all([listRoster(), listShows({ from: today }), listVenues()]);
    return { bands, shows, venues };
  }, today);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<RosterTab>('active');

  const view = useMemo(() => {
    if (!data) return null;
    const cards = bandCards(data.bands, data.shows, today);
    return { cards, venuesById: byId(data.venues), summary: rosterSummary(cards), counts: rosterTabCounts(cards) };
  }, [data, today]);

  const shown = view ? bandsForTab(view.cards, tab) : [];
  const tier = tierForBandCount(view?.summary.activeBands ?? 0);
  const untilNext = bandsUntilNextTier(view?.summary.activeBands ?? 0);
  const heroSummary = view && view.cards.length > 0
    ? `${plural(view.summary.activeBands, 'active band')} — ${plural(view.summary.booked, 'show')} booked and ${plural(view.summary.holds, 'hold')} out.`
    : undefined;

  return (
    <>
      <PageHero
        title="Roster"
        subtitle="Every band you carry"
        summary={heroSummary}
        scene={<RouteMapScene />}
        actions={
          <button type="button" className="btn btn-primary tours-new-btn" onClick={() => setAdding(true)}>
            + Add band
          </button>
        }
      />

      {error && (
        <div className="card tours-empty" role="alert">
          <div className="tours-empty-title">Your roster didn’t load</div>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      )}

      {loading && !data && !error && (
        <div className="tours-body" aria-busy="true">
          <span className="sr-only" role="status">
            Loading your roster…
          </span>
          <div className="tours-metrics">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="tour-metric tour-skeleton" />
            ))}
          </div>
          <div className="tours-grid">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="tour-card tour-skeleton tour-skeleton--card" />
            ))}
          </div>
        </div>
      )}

      {view && view.cards.length === 0 && (
        <div className="card tours-empty">
          <div className="tours-empty-title">No bands yet</div>
          <p>Add the acts you book. Bands don’t need their own Camel Ranch account to be on your roster.</p>
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            + Add a band
          </button>
        </div>
      )}

      {view && view.cards.length > 0 && (
        <div className="tours-body">
          <section className="tours-metrics" aria-label="Roster at a glance">
            <div className="tour-metric">
              <span className="tour-metric-label">Active bands</span>
              <div className="tour-metric-value">
                <strong>{view.summary.activeBands}</strong>
                <span>
                  {tier.label} plan{tier.monthlyUsd !== null ? ` · $${tier.monthlyUsd}/mo` : ''}
                </span>
              </div>
              <span className="tour-metric-note">
                {untilNext === null ? 'Custom pricing tier' : untilNext <= 3 ? `${plural(untilNext, 'more band')} moves you to the next tier` : 'Room to grow on this plan'}
              </span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Upcoming Shows</span>
              <div className="tour-metric-value">
                <strong>{view.summary.booked}</strong>
                <span>confirmed shows</span>
              </div>
              <span className="tour-metric-note">Across active bands, today on</span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Holds out</span>
              <div className="tour-metric-value">
                <strong>{view.summary.holds}</strong>
                <span>holds &amp; offers</span>
              </div>
              <span className="tour-metric-note">
                {view.summary.idleBands > 0 ? `${plural(view.summary.idleBands, 'band has', 'bands have')} nothing in play` : 'Every active band has work in play'}
              </span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Commission rates</span>
              <div className="tour-metric-value">
                <strong className={view.summary.needsRate > 0 ? 'tour-metric-hot' : undefined}>{view.summary.activeBands - view.summary.needsRate}</strong>
                <span>of {view.summary.activeBands} set</span>
              </div>
              <span className="tour-metric-note">
                {view.summary.needsRate > 0 ? `${plural(view.summary.needsRate, 'band needs', 'bands need')} a rate to track commission` : 'Commission tracks for every band'}
              </span>
            </div>
          </section>

          <div className="tours-toolbar">
            <div className="tours-tabs" role="group" aria-label="Show bands">
              {(Object.keys(TAB_LABELS) as RosterTab[]).map(t => (
                <button key={t} type="button" className={`tours-tab${tab === t ? ' tours-tab--on' : ''}`} aria-pressed={tab === t} onClick={() => setTab(t)}>
                  {TAB_LABELS[t]} · {view.counts[t]}
                </button>
              ))}
            </div>
            <span className="tours-sort-note">Active first, then by name</span>
          </div>

          {shown.length === 0 ? (
            <div className="card tours-empty">
              <div className="tours-empty-title">{tab === 'inactive' ? 'No inactive bands' : 'No active bands'}</div>
              {tab !== 'inactive' && (
                <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                  + Add a band
                </button>
              )}
            </div>
          ) : (
            <section className="tours-grid" aria-label={`${TAB_LABELS[tab]} bands`}>
              {shown.map(c => (
                <BandCard key={c.band.id} card={c} venuesById={view.venuesById} currentYear={year} />
              ))}
            </section>
          )}
        </div>
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
