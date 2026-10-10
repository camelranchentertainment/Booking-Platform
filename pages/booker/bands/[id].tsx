// pages/booker/bands/[id].tsx
// One band in the agent's roster: details, upcoming and past shows, commission.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import BookerShell from '../../../components/booker/BookerShell';
import ShowRow from '../../../components/booker/ShowRow';
import { RosterBandForm, ShowForm } from '../../../components/booker/forms';
import { EmptyState, ErrorBanner, PageHeader, SkeletonRows } from '../../../components/booker/ui';
import { archiveRosterBand, listPayments, listRoster, listShows, listVenues } from '../../../lib/booker/data';
import { todayIso } from '../../../lib/booker/dates';
import { commissionTotals, formatMoney } from '../../../lib/booker/commission';
import { byId, findConflicts } from '../../../lib/booker/workspace';
import { useLoad } from '../../../lib/booker/useLoad';
import type { BookerShow } from '../../../lib/booker/types';

function BandContent({ bandId }: { bandId: string }) {
  const router = useRouter();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const { data, loading, error, reload } = useLoad(async () => {
    const [bands, venues, shows, payments] = await Promise.all([listRoster(), listVenues(), listShows({ rosterId: bandId }), listPayments()]);
    return { bands, venues, shows, payments };
  }, bandId);
  const [editingShow, setEditingShow] = useState<BookerShow | 'new' | null>(null);
  const [editingBand, setEditingBand] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [removing, setRemoving] = useState(false);

  const band = data?.bands.find(b => b.id === bandId);

  const view = useMemo(() => {
    if (!data || !band) return null;
    const venuesById = byId(data.venues);
    const upcoming = data.shows.filter(s => s.show_date >= today);
    const past = data.shows.filter(s => s.show_date < today).reverse();
    const thisYear = data.shows.filter(s => s.show_date.startsWith(String(year)));
    const totals = commissionTotals(thisYear, new Map([[band.id, band]]), data.payments, today);
    return { venuesById, upcoming, past, totals };
  }, [data, band, today, year]);

  const remove = async () => {
    if (!band) return;
    setRemoving(true);
    setRemoveError('');
    try {
      await archiveRosterBand(band.id);
      await router.push('/booker/bands');
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
          <Link href="/booker/bands" className="btn btn-primary">
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
        <Link href="/booker/bands" className="text-muted">
          ← All bands
        </Link>
      </div>
      <PageHeader
        title={band.band_name}
        sub={[band.genre, [band.home_city, band.home_state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditingBand(true)}>
              Edit band
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setEditingShow('new')}>
              + Add show
            </button>
          </>
        }
      />

      <div className="grid-4 mb-6">
        <div className="card stat-block">
          <div className="stat-value">{band.commission_pct === null ? '—' : `${band.commission_pct}%`}</div>
          <div className="stat-label">Commission rate</div>
        </div>
        <div className="card stat-block">
          <div className="stat-value">{formatMoney(view.totals.due)}</div>
          <div className="stat-label">Earned {year}</div>
        </div>
        <div className="card stat-block">
          <div className="stat-value">{formatMoney(view.totals.outstanding)}</div>
          <div className="stat-label">Owed to you</div>
        </div>
        <div className="card stat-block">
          <div className="stat-value">{formatMoney(view.totals.projected)}</div>
          <div className="stat-label">Projected (confirmed)</div>
        </div>
      </div>

      <section aria-labelledby="up-h" className="mb-6">
        <h2 id="up-h" className="display" style={{ fontSize: '1.6rem', margin: '0 0 0.75rem' }}>
          Upcoming
        </h2>
        {view.upcoming.length === 0 ? (
          <p className="text-sm text-muted">Nothing booked yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {view.upcoming.map(s => (
              <ShowRow key={s.id} show={s} band={band} venuesById={view.venuesById} onOpen={setEditingShow} hideBand currentYear={year} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="past-h" className="mb-6">
        <h2 id="past-h" className="display" style={{ fontSize: '1.6rem', margin: '0 0 0.75rem' }}>
          Past shows
        </h2>
        {view.past.length === 0 ? (
          <p className="text-sm text-muted">No past shows recorded.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {view.past.slice(0, 50).map(s => (
              <ShowRow key={s.id} show={s} band={band} venuesById={view.venuesById} onOpen={setEditingShow} hideBand currentYear={year} />
            ))}
          </div>
        )}
      </section>

      {(band.contact_name || band.contact_email || band.contact_phone || band.notes) && (
        <section aria-labelledby="contact-h" className="card mb-6">
          <h2 id="contact-h" className="eyebrow" style={{ color: 'var(--accent)', fontSize: '1rem', margin: '0 0 0.5rem' }}>
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

      <section aria-labelledby="danger-h" className="card" style={{ borderColor: 'rgba(240,104,95,0.35)' }}>
        <h2 id="danger-h" className="eyebrow" style={{ color: 'var(--red)', fontSize: '1rem', margin: '0 0 0.4rem' }}>
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

      {editingShow && (
        <ShowForm
          show={editingShow === 'new' ? undefined : editingShow}
          bands={data.bands}
          venues={data.venues}
          defaultBandId={band.id}
          conflictsFor={(id, date, excludeId) => findConflicts(data.shows, id, date, excludeId)}
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
