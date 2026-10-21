// pages/booker/index.tsx
// Booking Agent home ("Booking Desk"), in the Tours page style:
//   1. Illustrated hero with the agency name, a next-show line and actions.
//   2. Four metric trackers: roster, this weekend, holds in play, next 60 days.
//   3. Needs attention (follow-ups, stale holds, unsettled shows, missing rates).
//   4. This weekend across every act, with a copyable lineup post.
//   5. One card per active band, then the combined agenda for the coming weeks.
//
// All counting lives in lib/booker/summary.ts and lib/booker/workspace.ts
// (unit-tested); this file only loads rows, holds UI state and renders.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import BookerShell, { useBooker } from '../../components/booker/BookerShell';
import BandCard from '../../components/booker/BandCard';
import RouteMapScene from '../../components/booker/RouteMapScene';
import ShowRow from '../../components/booker/ShowRow';
import WorkspaceRequirements from '../../components/booker/WorkspaceRequirements';
import { RosterBandForm, ShowForm } from '../../components/booker/forms';
import PageHero from '../../components/layout/PageHero';
import { formatMoney } from '../../lib/booker/commission';
import { listMessages, listRoster, listShows, listVenues, setFollowupDone } from '../../lib/booker/data';
import { addDays, formatShowDate, formatTime, todayIso, weekendRange } from '../../lib/booker/dates';
import { tierForBandCount } from '../../lib/booker/pricing';
import { bandCards, deskSummary, plural } from '../../lib/booker/summary';
import { holdCounts } from '../../lib/booker/holds';
import { attentionItems, byId, emailFollowups, findConflicts, groupByDate, venueLabel } from '../../lib/booker/workspace';
import { useLoad } from '../../lib/booker/useLoad';
import type { BookerShow, BookerVenue, RosterBand } from '../../lib/booker/types';

const LOOKBACK_DAYS = 90;
const AGENDA_DAYS = 60;
const ATTENTION_LIMIT = 12;

function lineupText(groups: Array<{ date: string; shows: BookerShow[] }>, bandsById: Map<string, RosterBand>, venuesById: Map<string, BookerVenue>, year: number): string {
  const lines = ['This weekend:'];
  for (const g of groups) {
    for (const s of g.shows) {
      if (s.status !== 'confirmed') continue;
      const time = formatTime(s.set_time);
      lines.push(`${formatShowDate(g.date, year)} — ${bandsById.get(s.roster_id)?.band_name ?? ''} @ ${venueLabel(s, venuesById)}${time ? ` (${time})` : ''}`);
    }
  }
  return lines.join('\n');
}

/** Placeholder layout while the desk loads (skeletons in the Tours shapes). */
function DeskSkeleton() {
  return (
    <div className="tours-body" aria-busy="true">
      <span className="sr-only" role="status">
        Loading your desk…
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
  );
}

function HomeContent() {
  const { booker } = useBooker();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const { data, loading, error, reload } = useLoad(
    async () => {
      const [bands, venues, shows, followups] = await Promise.all([
        listRoster(),
        listVenues(),
        listShows({ from: addDays(today, -LOOKBACK_DAYS) }),
        listMessages({ openFollowups: true, limit: 200 }),
      ]);
      return { bands, venues, shows, followups };
    },
    today,
  );
  const [editing, setEditing] = useState<BookerShow | 'new' | null>(null);
  const [addingBand, setAddingBand] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [doneBusy, setDoneBusy] = useState<string | null>(null);
  const [doneError, setDoneError] = useState('');

  const view = useMemo(() => {
    if (!data) return null;
    const bandsById = byId(data.bands);
    const venuesById = byId(data.venues);
    const weekend = weekendRange(today);
    const weekendGroups = groupByDate(data.shows.filter(s => s.show_date >= weekend.start && s.show_date <= weekend.end));
    const agendaEnd = addDays(today, AGENDA_DAYS);
    const agenda = groupByDate(data.shows.filter(s => s.show_date > weekend.end && s.show_date <= agendaEnd));
    return {
      bandsById,
      venuesById,
      weekend,
      weekendGroups,
      agenda,
      // Email follow-ups first: they are the agent's own promises to get back to someone.
      attention: [...emailFollowups(data.followups, venuesById, today), ...attentionItems(data.shows, data.bands, venuesById, today)],
      cards: bandCards(data.bands, data.shows, today).filter(c => c.band.status === 'active'),
      summary: deskSummary(data.bands, data.shows, today, AGENDA_DAYS),
      holds: holdCounts(data.shows, today),
    };
  }, [data, today]);

  const copyLineup = async () => {
    if (!view) return;
    try {
      await navigator.clipboard.writeText(lineupText(view.weekendGroups, view.bandsById, view.venuesById, year));
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
    setTimeout(() => setCopied('idle'), 2500);
  };

  const openShow = (s: BookerShow) => setEditing(s);
  const markDone = async (messageId: string) => {
    setDoneBusy(messageId);
    setDoneError('');
    try {
      await setFollowupDone(messageId, true);
      await reload();
    } catch (err) {
      setDoneError(err instanceof Error ? err.message : 'Could not mark it done.');
    } finally {
      setDoneBusy(null);
    }
  };
  const onSaved = () => {
    setEditing(null);
    void reload();
  };

  const hasBands = Boolean(data && data.bands.length > 0);
  const next = view?.summary.nextShow ?? null;
  const heroSummary = view
    ? next
      ? `Next up: ${view.bandsById.get(next.roster_id)?.band_name ?? 'a band'} at ${venueLabel(next, view.venuesById)}, ${formatShowDate(next.show_date, year)}.`
      : hasBands
        ? 'Nothing confirmed yet — add a show or work your holds.'
        : 'Add the bands you book to get started.'
    : undefined;
  const tier = tierForBandCount(view?.summary.activeBands ?? 0);
  const hasConfirmedWeekend = Boolean(view?.weekendGroups.some(g => g.shows.some(s => s.status === 'confirmed')));

  return (
    <>
      <PageHero
        title="Booking Desk"
        subtitle={booker.agency_name}
        summary={heroSummary}
        scene={<RouteMapScene />}
        actions={
          <div className="agent-hero-actions">
            <button type="button" className="btn btn-primary tours-new-btn" onClick={() => setEditing('new')} disabled={!hasBands}>
              + Add show
            </button>
            <button type="button" className="btn btn-secondary tours-new-btn" onClick={() => setAddingBand(true)}>
              + Add band
            </button>
            <Link href="/booker/venues#find" className="btn btn-secondary tours-new-btn">
              ⌕ Find venues
            </Link>
          </div>
        }
      />

      <WorkspaceRequirements />

      {error && (
        <div className="card tours-empty" role="alert">
          <div className="tours-empty-title">Your desk didn’t load</div>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      )}
      {loading && !data && !error && <DeskSkeleton />}

      {data && view && !hasBands && (
        <div className="card tours-empty">
          <div className="tours-empty-title">Add your first band</div>
          <p>Start with the acts you book. They don’t need their own Camel Ranch account — add any band and start tracking their shows right away.</p>
          <button type="button" className="btn btn-primary" onClick={() => setAddingBand(true)}>
            + Add a band
          </button>
        </div>
      )}

      {data && view && hasBands && (
        <div className="tours-body">
          <section className="tours-metrics" aria-label="Desk at a glance">
            <div className="tour-metric">
              <span className="tour-metric-label">Roster</span>
              <div className="tour-metric-value">
                <strong>{view.summary.activeBands}</strong>
                <span>{view.summary.activeBands === 1 ? 'active band' : 'active bands'}</span>
              </div>
              <span className="tour-metric-note">
                {tier.label} plan{tier.monthlyUsd !== null ? ` · $${tier.monthlyUsd}/mo` : ' · custom pricing'}
              </span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">This weekend</span>
              <div className="tour-metric-value">
                <strong>{view.summary.weekendConfirmed}</strong>
                <span>
                  {view.summary.weekendConfirmed === 1 ? 'show' : 'shows'} · {plural(view.summary.weekendBands, 'band')}
                </span>
              </div>
              <span className="tour-metric-note">
                {formatShowDate(view.weekend.start, year)} – {formatShowDate(view.weekend.end, year)}
              </span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Holds in play</span>
              <div className="tour-metric-value">
                <strong className={view.summary.holdsFollowupDue + view.holds.challenged + view.holds.expiring > 0 ? 'tour-metric-hot' : undefined}>{view.summary.holds}</strong>
                <span>holds &amp; offers</span>
              </div>
              <span className="tour-metric-note">
                {[
                  view.holds.challenged > 0 ? `${view.holds.challenged} challenged` : null,
                  view.holds.expiring > 0 ? `${view.holds.expiring} expiring soon` : null,
                  view.summary.holdsFollowupDue > 0 ? `${plural(view.summary.holdsFollowupDue, 'follow-up')} due` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Nothing pressing'}
              </span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Next {AGENDA_DAYS} days</span>
              <div className="tour-metric-value">
                <strong>{view.summary.windowConfirmed}</strong>
                <span>confirmed</span>
              </div>
              <span className="tour-metric-note">
                {view.summary.windowCommission > 0 ? `${formatMoney(view.summary.windowCommission)} projected commission` : 'No commission projected yet'}
              </span>
            </div>
          </section>

          {view.attention.length > 0 && (
            <section aria-labelledby="attention-h" className="card agent-attention">
              <div className="agent-section-head">
                <h2 id="attention-h" className="agent-section-title">
                  Needs attention
                </h2>
                <span className="agent-section-note">
                  {view.attention.length > ATTENTION_LIMIT ? `Showing ${ATTENTION_LIMIT} of ${view.attention.length}` : plural(view.attention.length, 'item')}
                </span>
              </div>
              {doneError && (
                <p role="alert" className="agent-attention-error">
                  {doneError}
                </p>
              )}
              <ul className="agent-attention-list">
                {view.attention.slice(0, ATTENTION_LIMIT).map(item => {
                  const target = item.showId ? data.shows.find(s => s.id === item.showId) : undefined;
                  return (
                    <li key={item.key}>
                      <span>
                        {item.kind === 'email_followup' && <span aria-hidden="true">✉ </span>}
                        {item.message}
                      </span>
                      {item.messageId ? (
                        <span className="agent-attention-actions">
                          {item.href && (
                            <Link className="btn btn-ghost btn-sm" href={item.href}>
                              Open
                            </Link>
                          )}
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => markDone(item.messageId!)} disabled={doneBusy === item.messageId} aria-busy={doneBusy === item.messageId}>
                            ✓ Done
                          </button>
                        </span>
                      ) : target ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openShow(target)}>
                          Open
                        </button>
                      ) : item.rosterId ? (
                        <Link className="btn btn-ghost btn-sm" href={`/booker/bands/${item.rosterId}`}>
                          Open
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section aria-labelledby="weekend-h" className="agent-section">
            <div className="agent-section-head">
              <div className="agent-section-titles">
                <h2 id="weekend-h" className="agent-section-title">
                  This weekend
                </h2>
                <span className="agent-section-note">
                  {formatShowDate(view.weekend.start, year)} – {formatShowDate(view.weekend.end, year)}
                </span>
              </div>
              {hasConfirmedWeekend && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={copyLineup}>
                  {copied === 'copied' ? 'Copied ✓' : copied === 'failed' ? 'Copy failed' : 'Copy lineup post'}
                </button>
              )}
              <span aria-live="polite" className="sr-only">
                {copied === 'copied' ? 'Lineup copied to clipboard' : copied === 'failed' ? 'Could not copy the lineup' : ''}
              </span>
            </div>
            {view.weekendGroups.length === 0 ? (
              <p className="agent-section-note">Nothing on the books for this weekend yet.</p>
            ) : (
              <div className="agent-days">
                {view.weekendGroups.map(g => (
                  <div key={g.date} className="agent-day">
                    <h3 className={`agent-day-label${g.date === today ? ' agent-day-label--today' : ''}`}>{g.date === today ? `Today · ${formatShowDate(g.date, year)}` : formatShowDate(g.date, year)}</h3>
                    {g.shows.map(s => (
                      <ShowRow key={s.id} show={s} band={view.bandsById.get(s.roster_id)} venuesById={view.venuesById} onOpen={openShow} hideDate currentYear={year} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="bands-h" className="agent-section">
            <div className="agent-section-head">
              <h2 id="bands-h" className="agent-section-title">
                Your bands
              </h2>
              <Link href="/booker/bands" className="tour-card-cta">
                Whole roster →
              </Link>
            </div>
            {view.cards.length === 0 ? (
              <p className="agent-section-note">No active bands. Reactivate one from the roster, or add a new band.</p>
            ) : (
              <div className="tours-grid">
                {view.cards.map(c => (
                  <BandCard key={c.band.id} card={c} venuesById={view.venuesById} currentYear={year} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="agenda-h" className="agent-section">
            <div className="agent-section-head">
              <h2 id="agenda-h" className="agent-section-title">
                Next {AGENDA_DAYS} days
              </h2>
              <Link href="/booker/shows" className="tour-card-cta">
                All shows →
              </Link>
            </div>
            {view.agenda.length === 0 ? (
              <p className="agent-section-note">Nothing booked after this weekend in the next {AGENDA_DAYS} days.</p>
            ) : (
              <div className="agent-days">
                {view.agenda.map(g => (
                  <div key={g.date} className="agent-day">
                    <h3 className="agent-day-label">{formatShowDate(g.date, year)}</h3>
                    {g.shows.map(s => (
                      <ShowRow key={s.id} show={s} band={view.bandsById.get(s.roster_id)} venuesById={view.venuesById} onOpen={openShow} hideDate currentYear={year} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {editing && data && (
        <ShowForm
          show={editing === 'new' ? undefined : editing}
          bands={data.bands}
          venues={data.venues}
          conflictsFor={(bandId, date, excludeId) => findConflicts(data.shows, bandId, date, excludeId)}
          otherShows={data.shows}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onArchived={onSaved}
        />
      )}
      {addingBand && (
        <RosterBandForm
          colorIndex={data?.bands.length ?? 0}
          onClose={() => setAddingBand(false)}
          onSaved={() => {
            setAddingBand(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

export default function BookerHome() {
  return (
    <BookerShell title="Home">
      <HomeContent />
    </BookerShell>
  );
}
