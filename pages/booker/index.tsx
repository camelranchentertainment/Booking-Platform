// pages/booker/index.tsx
// Booking Agent home: this weekend across every act, what needs attention,
// one tile per band, and the combined agenda for the coming weeks.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import BookerShell from '../../components/booker/BookerShell';
import ShowRow from '../../components/booker/ShowRow';
import { RosterBandForm, ShowForm } from '../../components/booker/forms';
import { BandDot, EmptyState, ErrorBanner, PageHeader, SkeletonRows } from '../../components/booker/ui';
import { listRoster, listShows, listVenues } from '../../lib/booker/data';
import { addDays, formatShowDate, formatTime, todayIso, weekendRange } from '../../lib/booker/dates';
import { attentionItems, bandTiles, byId, findConflicts, groupByDate, venueLabel } from '../../lib/booker/workspace';
import { useLoad } from '../../lib/booker/useLoad';
import type { BookerShow, BookerVenue, RosterBand } from '../../lib/booker/types';

const LOOKBACK_DAYS = 90;
const AGENDA_DAYS = 60;

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

function HomeContent() {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const { data, loading, error, reload } = useLoad(
    async () => {
      const [bands, venues, shows] = await Promise.all([listRoster(), listVenues(), listShows({ from: addDays(today, -LOOKBACK_DAYS) })]);
      return { bands, venues, shows };
    },
    today,
  );
  const [editing, setEditing] = useState<BookerShow | 'new' | null>(null);
  const [addingBand, setAddingBand] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');

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
      attention: attentionItems(data.shows, data.bands, venuesById, today),
      tiles: bandTiles(data.bands, data.shows, today),
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
  const onSaved = () => {
    setEditing(null);
    void reload();
  };

  return (
    <>
      <PageHeader
        title="Home"
        sub={formatShowDate(today, year)}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAddingBand(true)}>
              + Add band
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} disabled={!data || data.bands.length === 0}>
              + Add show
            </button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <SkeletonRows rows={6} />}

      {data && view && data.bands.length === 0 && (
        <EmptyState
          title="Add your first band"
          body="Start with the acts you book. They don't need their own Camel Ranch account — you can add any band and start tracking their shows right away."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setAddingBand(true)}>
              + Add a band
            </button>
          }
        />
      )}

      {data && view && data.bands.length > 0 && (
        <div style={{ display: 'grid', gap: '1.75rem' }}>
          {/* This weekend */}
          <section aria-labelledby="weekend-h">
            <div className="flex items-center justify-between mb-3" style={{ gap: '1rem', flexWrap: 'wrap' }}>
              <h2 id="weekend-h" className="display" style={{ fontSize: '1.6rem', margin: 0 }}>
                This weekend <span className="text-sm text-muted" style={{ fontFamily: 'var(--font-body)' }}>{formatShowDate(view.weekend.start, year)} – {formatShowDate(view.weekend.end, year)}</span>
              </h2>
              {view.weekendGroups.some(g => g.shows.some(s => s.status === 'confirmed')) && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={copyLineup}>
                  {copied === 'copied' ? 'Copied ✓' : copied === 'failed' ? 'Copy failed' : 'Copy lineup post'}
                </button>
              )}
              <span aria-live="polite" className="text-xs text-muted" style={{ position: 'absolute', left: -9999 }}>
                {copied === 'copied' ? 'Lineup copied to clipboard' : ''}
              </span>
            </div>
            {view.weekendGroups.length === 0 ? (
              <p className="text-sm text-muted">Nothing on the books for this weekend yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {view.weekendGroups.map(g => (
                  <div key={g.date}>
                    <h3 className="eyebrow" style={{ color: 'var(--accent)', fontSize: '1rem', margin: '0 0 0.4rem' }}>
                      {formatShowDate(g.date, year)}
                    </h3>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {g.shows.map(s => (
                        <ShowRow key={s.id} show={s} band={view.bandsById.get(s.roster_id)} venuesById={view.venuesById} onOpen={openShow} hideDate currentYear={year} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Needs attention */}
          {view.attention.length > 0 && (
            <section aria-labelledby="attention-h" className="card card-warning">
              <h2 id="attention-h" className="display" style={{ fontSize: '1.4rem', margin: '0 0 0.6rem' }}>
                Needs attention <span className="text-sm text-muted">({view.attention.length})</span>
              </h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem' }}>
                {view.attention.slice(0, 12).map(item => {
                  const target = item.showId ? data.shows.find(s => s.id === item.showId) : undefined;
                  return (
                    <li key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text)' }}>{item.message}</span>
                      {target ? (
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

          {/* Band tiles */}
          <section aria-labelledby="bands-h">
            <h2 id="bands-h" className="display" style={{ fontSize: '1.6rem', margin: '0 0 0.75rem' }}>
              Your bands
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.9rem' }}>
              {view.tiles.map(t => (
                <Link key={t.band.id} href={`/booker/bands/${t.band.id}`} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textDecoration: 'none', color: 'inherit', borderTop: `3px solid ${t.band.color ?? 'var(--accent)'}` }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '1.05rem', color: 'var(--text)' }}>
                    <BandDot color={t.band.color} />
                    {t.band.band_name}
                  </span>
                  <span className="text-sm text-muted">
                    {t.nextShow ? (
                      <>
                        Next: {formatShowDate(t.nextShow.show_date, year)} · {venueLabel(t.nextShow, view.venuesById)}
                      </>
                    ) : (
                      'Nothing booked yet'
                    )}
                  </span>
                  <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className="badge badge-confirmed">{t.upcomingCount} booked</span>
                    {t.holdCount > 0 && <span className="badge badge-hold">{t.holdCount} on hold</span>}
                    {t.band.commission_pct !== null && <span className="badge badge-completed">{t.band.commission_pct}%</span>}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Agenda */}
          <section aria-labelledby="agenda-h">
            <h2 id="agenda-h" className="display" style={{ fontSize: '1.6rem', margin: '0 0 0.75rem' }}>
              Next {AGENDA_DAYS} days
            </h2>
            {view.agenda.length === 0 ? (
              <p className="text-sm text-muted">Nothing booked after this weekend in the next {AGENDA_DAYS} days.</p>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {view.agenda.map(g => (
                  <div key={g.date}>
                    <h3 className="eyebrow" style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: '0 0 0.4rem' }}>
                      {formatShowDate(g.date, year)}
                    </h3>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {g.shows.map(s => (
                        <ShowRow key={s.id} show={s} band={view.bandsById.get(s.roster_id)} venuesById={view.venuesById} onOpen={openShow} hideDate currentYear={year} />
                      ))}
                    </div>
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
