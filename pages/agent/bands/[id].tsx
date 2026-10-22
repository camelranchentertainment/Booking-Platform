// pages/agent/bands/[id].tsx
// One band in the agent's roster, in the Tours page style: illustrated hero,
// four trackers, Upcoming / Past tabs with shows grouped by date, then the
// band account (link, sharing, send shows, their calendar), the band contact,
// the emails sent about the band and the remove option.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import BookerShell from '../../../components/booker/BookerShell';
import ShowRow from '../../../components/booker/ShowRow';
import ComposeEmail, { type Recipient } from '../../../components/booker/ComposeEmail';
import MessageHistory from '../../../components/booker/MessageHistory';
import { RosterBandForm, ShowForm } from '../../../components/booker/forms';
import { EmptyState, ErrorBanner, SkeletonRows } from '../../../components/booker/ui';
import RouteMapScene from '../../../components/booker/RouteMapScene';
import BandAccountPanel from '../../../components/booker/BandAccountPanel';
import PageHero from '../../../components/layout/PageHero';
import { archiveRosterBand, listMessages, listPayments, listRoster, listShows, listVenues } from '../../../lib/booker/data';
import { formatShowDate, todayIso } from '../../../lib/booker/dates';
import { bandCards, groupInOrder, showTabCounts, showsForTab } from '../../../lib/booker/summary';
import { commissionTotals, formatMoney, repeatShowIds } from '../../../lib/booker/commission';
import { byId, findConflicts, venueLabel } from '../../../lib/booker/workspace';
import { useLoad } from '../../../lib/booker/useLoad';
import { currentLink, handoffChip, latestProposalByShow, type BandLink, type BandProposal } from '../../../lib/booker/handoff';
import { listBandLinks, listBandProposals } from '../../../lib/booker/handoffData';
import type { BookerShow } from '../../../lib/booker/types';

/** This band's links and the shows sent through them, or an error message for the panel. */
async function loadHandoff(bandId: string): Promise<{ links: BandLink[]; proposals: BandProposal[]; handoffError: string | null }> {
  try {
    const links = (await listBandLinks()).filter(l => l.roster_id === bandId);
    const proposals = await listBandProposals(links.map(l => l.id));
    return { links, proposals, handoffError: null };
  } catch (err) {
    return { links: [], proposals: [], handoffError: err instanceof Error ? err.message : 'Could not load the band account.' };
  }
}

function BandContent({ bandId }: { bandId: string }) {
  const router = useRouter();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const { data, loading, error, reload } = useLoad(async () => {
    const [bands, venues, shows, payments, messages, upcomingAll, handoff] = await Promise.all([
      listRoster(),
      listVenues(),
      listShows({ rosterId: bandId }),
      listPayments(),
      listMessages({ rosterId: bandId }),
      // Every band's upcoming shows, so the show form can warn when another of
      // the agent's bands is already at the same venue that night.
      listShows({ from: today }),
      // The hand-off is loaded on its own so a problem there never blanks
      // the rest of the band page; the panel shows its own error instead.
      loadHandoff(bandId),
    ]);
    return { bands, venues, shows, payments, messages, upcomingAll, ...handoff };
  }, bandId);
  const [editingShow, setEditingShow] = useState<BookerShow | 'new' | null>(null);
  const [editingBand, setEditingBand] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [removing, setRemoving] = useState(false);
  const [composing, setComposing] = useState(false);
  const [sentNotice, setSentNotice] = useState('');
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const band = data?.bands.find(b => b.id === bandId);

  const view = useMemo(() => {
    if (!data || !band) return null;
    const venuesById = byId(data.venues);
    const thisYear = data.shows.filter(s => s.show_date.startsWith(String(year)));
    const totals = commissionTotals(thisYear, new Map([[band.id, band]]), data.payments, today, repeatShowIds(data.shows));
    return {
      venuesById,
      totals,
      card: bandCards([band], data.shows, today)[0],
      counts: showTabCounts(data.shows, today),
      upcomingGroups: groupInOrder(showsForTab(data.shows, 'upcoming', today)),
      pastGroups: groupInOrder(showsForTab(data.shows, 'past', today).slice(0, 50)),
      // Hand-off chips only for the current link's proposals.
      handoffByShow: latestProposalByShow(data.proposals.filter(p => p.link_id === currentLink(data.links, band.id)?.id)),
    };
  }, [data, band, today, year]);

  const remove = async () => {
    if (!band) return;
    setRemoving(true);
    setRemoveError('');
    try {
      await archiveRosterBand(band.id);
      await router.push('/agent/bands');
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Could not remove the band.');
      setRemoving(false);
    }
  };

  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (loading && !data) return <SkeletonRows rows={6} />;
  if (data && !band) {
    return (
      <EmptyState
        title="Band not found"
        body="It may have been removed from your roster."
        action={
          <Link href="/agent/bands" className="btn btn-primary">
            Back to bands
          </Link>
        }
      />
    );
  }
  if (!data || !band || !view) return null;

  const onSaved = () => {
    setEditingShow(null);
    void reload();
  };

  return (
    <>
      <div className="text-sm mb-2">
        <Link href="/agent/bands" className="text-muted">
          ← All bands
        </Link>
      </div>
      <PageHero
        title={band.band_name}
        subtitle={[band.genre, [band.home_city, band.home_state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'On your roster'}
        summary={
          view.card.nextShow
            ? `${view.card.nextShow.status === 'confirmed' ? 'Next show' : view.card.nextShow.status === 'hold' ? 'Next hold' : 'Next offer'}: ${formatShowDate(view.card.nextShow.show_date, year)} at ${venueLabel(view.card.nextShow, view.venuesById)}.`
            : 'Nothing on the calendar yet.'
        }
        scene={<RouteMapScene />}
        actions={
          <div className="agent-hero-actions">
            <button type="button" className="btn btn-primary tours-new-btn" onClick={() => setEditingShow('new')}>
              + Add show
            </button>
            <button type="button" className="btn btn-secondary tours-new-btn" onClick={() => setComposing(true)}>
              ✉ Email band
            </button>
            <button type="button" className="btn btn-secondary tours-new-btn" onClick={() => setEditingBand(true)}>
              Edit band
            </button>
          </div>
        }
      />

      <div aria-live="polite">
        {sentNotice && (
          <p role="status" className="card text-sm" style={{ color: 'var(--green)', borderColor: 'rgba(74,222,128,0.35)', padding: '0.7rem 1rem' }}>
            {sentNotice}
          </p>
        )}
      </div>

      <div className="tours-body mb-6">
        <section className="tours-metrics" aria-label={`${band.band_name} at a glance`}>
          <div className="tour-metric">
            <span className="tour-metric-label">Upcoming Shows</span>
            <div className="tour-metric-value">
              <strong>{view.card.booked}</strong>
              <span>confirmed</span>
            </div>
            <span className="tour-metric-note">{view.card.holds === 0 ? 'No holds or offers out' : view.card.holds === 1 ? '1 hold or offer still out' : `${view.card.holds} holds & offers still out`}</span>
          </div>
          <div className="tour-metric">
            <span className="tour-metric-label">Commission rate</span>
            <div className="tour-metric-value">
              <strong className={band.commission_pct === null ? 'tour-metric-hot' : undefined}>{band.commission_pct === null ? '—' : `${band.commission_pct}%`}</strong>
            </div>
            <span className="tour-metric-note">{band.commission_pct === null ? 'Set it in Edit band to track commission' : 'Paid to you by the band'}</span>
          </div>
          <div className="tour-metric">
            <span className="tour-metric-label">Earned {year}</span>
            <div className="tour-metric-value">
              <strong>{formatMoney(view.totals.due)}</strong>
            </div>
            <span className="tour-metric-note">{view.totals.outstanding > 0 ? `${formatMoney(view.totals.outstanding)} still owed to you` : 'Nothing owed'}</span>
          </div>
          <div className="tour-metric">
            <span className="tour-metric-label">Projected</span>
            <div className="tour-metric-value">
              <strong>{formatMoney(view.totals.projected)}</strong>
            </div>
            <span className="tour-metric-note">From confirmed shows still to come</span>
          </div>
        </section>

        <section aria-labelledby="shows-h" className="agent-section">
          <div className="agent-section-head">
            <h2 id="shows-h" className="agent-section-title">
              Shows
            </h2>
          </div>
          <div className="tours-toolbar">
            <div className="tours-tabs" role="group" aria-label="Show dates">
              {(['upcoming', 'past'] as const).map(t => (
                <button key={t} type="button" className={`tours-tab${tab === t ? ' tours-tab--on' : ''}`} aria-pressed={tab === t} onClick={() => setTab(t)}>
                  {t === 'upcoming' ? 'Upcoming' : 'Past'} · {view.counts[t]}
                </button>
              ))}
            </div>
            <span className="tours-sort-note">{tab === 'upcoming' ? 'Soonest first' : 'Most recent first · last 50'}</span>
          </div>
          {(tab === 'upcoming' ? view.upcomingGroups : view.pastGroups).length === 0 ? (
            <div className="card tours-empty">
              <div className="tours-empty-title">{tab === 'upcoming' ? 'Nothing booked yet' : 'No past shows yet'}</div>
              {tab === 'upcoming' && (
                <button type="button" className="btn btn-primary" onClick={() => setEditingShow('new')}>
                  + Add show
                </button>
              )}
            </div>
          ) : (
            <div className="agent-days">
              {(tab === 'upcoming' ? view.upcomingGroups : view.pastGroups).map(g => (
                <div key={g.date} className="agent-day">
                  <h3 className={`agent-day-label${g.date === today ? ' agent-day-label--today' : ''}`}>{g.date === today ? `Today · ${formatShowDate(g.date, year)}` : formatShowDate(g.date, year)}</h3>
                  {g.shows.map(s => (
                    <ShowRow key={s.id} show={s} band={band} venuesById={view.venuesById} onOpen={setEditingShow} hideBand hideDate currentYear={year} handoff={handoffChip(view.handoffByShow.get(s.id))} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {data.handoffError ? (
        <section aria-labelledby="band-account-h" className="card mb-6" id="band-account">
          <h2 id="band-account-h" className="agent-card-title">
            Band account
          </h2>
          <ErrorBanner message={data.handoffError} onRetry={() => void reload()} />
        </section>
      ) : (
        <BandAccountPanel
          band={band}
          shows={data.shows}
          venuesById={view.venuesById}
          links={data.links}
          proposals={data.proposals}
          today={today}
          year={year}
          onChanged={() => void reload()}
        />
      )}

      {(band.contact_name || band.contact_email || band.contact_phone || band.notes) && (
        <section aria-labelledby="contact-h" className="card mb-6">
          <h2 id="contact-h" className="agent-card-title">
            Band contact
          </h2>
          <div className="text-sm" style={{ display: 'grid', gap: 4, color: 'var(--text)' }}>
            {band.contact_name && <span>{band.contact_name}</span>}
            {band.contact_email && <a href={`mailto:${band.contact_email}`}>{band.contact_email}</a>}
            {band.contact_phone && <a href={`tel:${band.contact_phone}`}>{band.contact_phone}</a>}
            {band.notes && <p style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0 0', color: 'var(--text-muted)' }}>{band.notes}</p>}
          </div>
        </section>
      )}

      <section aria-labelledby="bmail-h" className="card mb-6">
        <div className="flex items-center justify-between mb-3" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <h2 id="bmail-h" className="agent-card-title">
            Emails about {band.band_name}
          </h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setComposing(true)}>
            ✉ New email
          </button>
        </div>
        <MessageHistory messages={data.messages} onChanged={() => void reload()} emptyText="Nothing yet. Emails to the band, and to venues about this band, are kept here." />
      </section>

      <section aria-labelledby="danger-h" className="card" style={{ borderColor: 'rgba(240,104,95,0.35)' }}>
        <h2 id="danger-h" className="agent-card-title agent-card-title--danger">
          Remove from roster
        </h2>
        <p className="text-sm text-muted" style={{ marginTop: 0 }}>
          Removing hides this band from your workspace. Its shows and commission history are kept. To pause a band without removing it, set it to Inactive instead.
        </p>
        {removeError && <ErrorBanner message={removeError} />}
        {!confirmRemove ? (
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmRemove(true)}>
            Remove {band.band_name}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="text-sm" style={{ color: 'var(--text)' }}>
              Remove {band.band_name} from your roster?
            </span>
            <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={removing} aria-busy={removing}>
              {removing ? 'Removing…' : 'Yes, remove'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(false)} disabled={removing}>
              Keep
            </button>
          </div>
        )}
      </section>

      {composing && (
        <ComposeEmail
          recipients={band.contact_email ? [{ email: band.contact_email, name: band.contact_name, label: band.contact_name ? `${band.contact_name} (${band.band_name})` : `${band.band_name} contact` } satisfies Recipient] : []}
          bands={data.bands}
          shows={data.shows}
          venuesById={view.venuesById}
          defaultBandId={band.id}
          audience="band"
          onClose={() => setComposing(false)}
          onSent={result => {
            setComposing(false);
            setSentNotice(result.warning ?? 'Email sent. It’s saved under Emails below.');
            setTimeout(() => setSentNotice(''), 6000);
            void reload();
          }}
        />
      )}
      {editingShow && (
        <ShowForm
          show={editingShow === 'new' ? undefined : editingShow}
          bands={data.bands}
          venues={data.venues}
          defaultBandId={band.id}
          conflictsFor={(id, date, excludeId) => findConflicts(data.shows, id, date, excludeId)}
          otherShows={data.upcomingAll}
          onClose={() => setEditingShow(null)}
          onSaved={onSaved}
          onArchived={onSaved}
        />
      )}
      {editingBand && (
        <RosterBandForm
          band={band}
          onClose={() => setEditingBand(false)}
          onSaved={() => {
            setEditingBand(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

export default function BookerBandPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  return (
    <BookerShell title="Band">
      {id ? <BandContent bandId={id} /> : <SkeletonRows />}
    </BookerShell>
  );
}
