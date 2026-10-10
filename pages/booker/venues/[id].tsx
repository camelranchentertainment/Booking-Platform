// pages/booker/venues/[id].tsx
// One venue (or festival, fair, promoter, private-event buyer): details, its
// contacts with a "Show to my bands" checkbox each, website scan, and the shows
// the agent's bands have played or booked there.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import BookerShell from '../../../components/booker/BookerShell';
import ShowRow from '../../../components/booker/ShowRow';
import { ContactForm, ShowForm, VenueForm } from '../../../components/booker/forms';
import { EmptyState, ErrorBanner, PageHeader, SkeletonRows } from '../../../components/booker/ui';
import { archiveContact, archiveVenue, listContacts, listRoster, listShows, listVenues, scanVenueWebsite, setContactShared } from '../../../lib/booker/data';
import { todayIso } from '../../../lib/booker/dates';
import { byId, findConflicts } from '../../../lib/booker/workspace';
import { useLoad } from '../../../lib/booker/useLoad';
import { VENUE_KIND_LABEL, type BookerContact, type BookerShow } from '../../../lib/booker/types';

const FIELD_LABEL: Record<string, string> = { email: 'booking email', phone: 'phone', capacity: 'capacity', notes: 'notes' };

function VenueContent({ venueId }: { venueId: string }) {
  const router = useRouter();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const { data, loading, error, reload } = useLoad(async () => {
    const [venues, contacts, shows, bands] = await Promise.all([listVenues(), listContacts(), listShows(), listRoster()]);
    return { venues, contacts, shows, bands };
  }, venueId);

  const [editingVenue, setEditingVenue] = useState(false);
  const [editingContact, setEditingContact] = useState<BookerContact | 'new' | null>(null);
  const [editingShow, setEditingShow] = useState<BookerShow | 'new' | null>(null);
  const [scan, setScan] = useState<{ state: 'idle' | 'scanning' | 'done' | 'error'; message?: string }>({ state: 'idle' });
  const [shareBusy, setShareBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [confirmContact, setConfirmContact] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const venue = data?.venues.find(v => v.id === venueId);
  const view = useMemo(() => {
    if (!data || !venue) return null;
    const contacts = data.contacts.filter(c => c.venue_id === venue.id);
    const shows = data.shows.filter(s => s.venue_id === venue.id);
    return {
      contacts,
      upcoming: shows.filter(s => s.show_date >= today),
      past: shows.filter(s => s.show_date < today).reverse(),
      bandsById: byId(data.bands),
      venuesById: byId(data.venues),
    };
  }, [data, venue, today]);

  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (loading && !data) return <SkeletonRows rows={6} />;
  if (data && !venue) {
    return (
      <EmptyState
        title="Not found"
        body="This venue may have been removed from your book."
        action={
          <Link href="/booker/venues" className="btn btn-primary">
            Back to Venues &amp; Buyers
          </Link>
        }
      />
    );
  }
  if (!data || !venue || !view) return null;

  const runScan = async () => {
    setScan({ state: 'scanning' });
    try {
      const r = await scanVenueWebsite(venue.id);
      const parts: string[] = [];
      if (r.contactAdded) parts.push('added a new contact (private until you tick “Show to my bands”)');
      if (r.filled.length) parts.push(`filled in ${r.filled.map(f => FIELD_LABEL[f] ?? f).join(', ')}`);
      setScan({ state: 'done', message: parts.length ? `Scanned ${r.pagesScanned} page${r.pagesScanned === 1 ? '' : 's'}: ${parts.join(' and ')}.` : `Scanned ${r.pagesScanned} page${r.pagesScanned === 1 ? '' : 's'}. Nothing new found — everything it found is already here.` });
      await reload();
    } catch (err) {
      setScan({ state: 'error', message: err instanceof Error ? err.message : 'Scan failed.' });
    }
  };

  const toggleShare = async (c: BookerContact, share: boolean) => {
    setShareBusy(c.id);
    setActionError('');
    try {
      await setContactShared(c.id, share);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the contact.');
    } finally {
      setShareBusy(null);
    }
  };

  const removeContact = async (id: string) => {
    setActionError('');
    try {
      await archiveContact(id);
      setConfirmContact(null);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove the contact.');
    }
  };

  const removeVenue = async () => {
    setActionError('');
    try {
      await archiveVenue(venue.id);
      await router.push('/booker/venues');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove.');
    }
  };

  const onShowSaved = () => {
    setEditingShow(null);
    void reload();
  };

  const location = [venue.address, venue.city, venue.state, venue.postal_code].filter(Boolean).join(', ');

  return (
    <>
      <div className="text-sm mb-2">
        <Link href="/booker/venues" className="text-muted">
          ← Venues &amp; Buyers
        </Link>
      </div>
      <PageHeader
        title={venue.name}
        sub={[VENUE_KIND_LABEL[venue.kind], [venue.city, venue.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditingVenue(true)}>
              Edit details
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setEditingShow('new')} disabled={data.bands.length === 0}>
              + Book a show here
            </button>
          </>
        }
      />
      {actionError && <ErrorBanner message={actionError} />}

      <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }} className="mb-6">
        {/* Details */}
        <section aria-labelledby="details-h" className="card">
          <h2 id="details-h" className="eyebrow" style={{ color: 'var(--accent)', fontSize: '1.05rem', margin: '0 0 0.75rem' }}>
            Details
          </h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.45rem 1rem', margin: 0, fontSize: '0.9rem' }}>
            <dt className="text-muted">Address</dt>
            <dd style={{ margin: 0, color: 'var(--text)' }}>{location || '—'}</dd>
            <dt className="text-muted">Website</dt>
            <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
              {venue.website ? (
                <a href={venue.website} target="_blank" rel="noopener noreferrer">
                  {venue.website.replace(/^https?:\/\//, '')}
                </a>
              ) : (
                '—'
              )}
            </dd>
            <dt className="text-muted">Booking email</dt>
            <dd style={{ margin: 0 }}>{venue.email ? <a href={`mailto:${venue.email}`}>{venue.email}</a> : '—'}</dd>
            <dt className="text-muted">Phone</dt>
            <dd style={{ margin: 0 }}>{venue.phone ? <a href={`tel:${venue.phone}`}>{venue.phone}</a> : '—'}</dd>
            <dt className="text-muted">Capacity</dt>
            <dd style={{ margin: 0, color: 'var(--text)' }}>{venue.capacity ?? '—'}</dd>
          </dl>
          {venue.notes && <p style={{ whiteSpace: 'pre-wrap', margin: '0.9rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>{venue.notes}</p>}
        </section>

        {/* Contacts */}
        <section aria-labelledby="contacts-h" className="card">
          <div className="flex items-center justify-between mb-3" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            <h2 id="contacts-h" className="eyebrow" style={{ color: 'var(--accent)', fontSize: '1.05rem', margin: 0 }}>
              Contacts
            </h2>
            <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={runScan}
                disabled={!venue.website || scan.state === 'scanning'}
                aria-busy={scan.state === 'scanning'}
                title={venue.website ? undefined : 'Add a website in Edit details to scan it'}
              >
                {scan.state === 'scanning' ? 'Scanning website…' : 'Scan website for contacts'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingContact('new')}>
                + Add contact
              </button>
            </span>
          </div>
          <div aria-live="polite">
            {scan.state === 'scanning' && <p className="text-sm text-muted">Reading the venue’s website. This can take up to a minute.</p>}
            {scan.state === 'done' && <p className="text-sm" style={{ color: 'var(--green)' }}>{scan.message}</p>}
            {scan.state === 'error' && (
              <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>
                {scan.message}
              </p>
            )}
          </div>

          {view.contacts.length === 0 ? (
            <p className="text-sm text-muted" style={{ margin: 0 }}>
              No contacts yet. {venue.website ? 'Scan the website, or add one yourself.' : 'Add one, or add the website in Edit details and scan it.'}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.6rem' }}>
              {view.contacts.map(c => (
                <li key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.7rem 0.85rem', background: 'var(--surface-2)' }}>
                  <div className="flex justify-between" style={{ gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 800 }}>
                        {c.name}
                        {c.source === 'website' && <span className="badge badge-completed" style={{ marginLeft: 8 }}>From website</span>}
                      </div>
                      {c.title && <div className="text-xs text-muted">{c.title}</div>}
                      <div className="text-sm" style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', marginTop: 4 }}>
                        {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                        {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
                      </div>
                    </div>
                    <span style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingContact(c)} aria-label={`Edit ${c.name}`}>
                        Edit
                      </button>
                      {confirmContact === c.id ? (
                        <>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeContact(c.id)}>
                            Remove
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmContact(null)}>
                            Keep
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmContact(c.id)} aria-label={`Remove ${c.name}`}>
                          Remove
                        </button>
                      )}
                    </span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.55rem', cursor: 'pointer', fontSize: '0.85rem', color: c.share_with_bands ? 'var(--text)' : 'var(--text-muted)' }}>
                    <input
                      type="checkbox"
                      checked={c.share_with_bands}
                      disabled={shareBusy === c.id}
                      onChange={e => toggleShare(c, e.target.checked)}
                      style={{ width: 18, height: 18 }}
                    />
                    Show to my bands
                    {shareBusy === c.id && <span className="text-xs text-muted">Saving…</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted" style={{ margin: '0.85rem 0 0' }}>
            Contacts are private by default. Ticked contacts will be visible to bands you represent once they link to your workspace.
          </p>
        </section>
      </div>

      <section aria-labelledby="vshows-h" className="mb-6">
        <h2 id="vshows-h" className="display" style={{ fontSize: '1.6rem', margin: '0 0 0.75rem' }}>
          Shows here
        </h2>
        {view.upcoming.length === 0 && view.past.length === 0 ? (
          <p className="text-sm text-muted">None of your bands have a show here yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {[...view.upcoming, ...view.past].map(s => (
              <ShowRow key={s.id} show={s} band={view.bandsById.get(s.roster_id)} venuesById={view.venuesById} onOpen={setEditingShow} currentYear={year} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="vremove-h" className="card" style={{ borderColor: 'rgba(240,104,95,0.35)' }}>
        <h2 id="vremove-h" className="eyebrow" style={{ color: 'var(--red)', fontSize: '1rem', margin: '0 0 0.4rem' }}>
          Remove from your book
        </h2>
        <p className="text-sm text-muted" style={{ marginTop: 0 }}>
          Hides this entry and its contacts. Shows booked here keep their history.
        </p>
        {!confirmRemove ? (
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmRemove(true)}>
            Remove {venue.name}
          </button>
        ) : (
          <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="text-sm" style={{ color: 'var(--text)' }}>
              Remove {venue.name}?
            </span>
            <button type="button" className="btn btn-danger btn-sm" onClick={removeVenue}>
              Yes, remove
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(false)}>
              Keep
            </button>
          </span>
        )}
      </section>

      {editingVenue && (
        <VenueForm
          venue={venue}
          onClose={() => setEditingVenue(false)}
          onSaved={() => {
            setEditingVenue(false);
            void reload();
          }}
        />
      )}
      {editingContact && (
        <ContactForm
          contact={editingContact === 'new' ? undefined : editingContact}
          venueId={venue.id}
          venueName={venue.name}
          onClose={() => setEditingContact(null)}
          onSaved={() => {
            setEditingContact(null);
            void reload();
          }}
        />
      )}
      {editingShow && (
        <ShowForm
          show={editingShow === 'new' ? undefined : editingShow}
          bands={data.bands}
          venues={data.venues}
          defaultVenueId={venue.id}
          conflictsFor={(id, date, excludeId) => findConflicts(data.shows, id, date, excludeId)}
          onClose={() => setEditingShow(null)}
          onSaved={onShowSaved}
          onArchived={onShowSaved}
        />
      )}
    </>
  );
}

export default function BookerVenuePage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  return <BookerShell title="Venue">{id ? <VenueContent venueId={id} /> : <SkeletonRows />}</BookerShell>;
}
