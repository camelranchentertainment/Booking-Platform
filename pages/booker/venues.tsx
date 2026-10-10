// pages/booker/venues.tsx
// The agent's own venue book, shared across every band they carry.

import { useMemo, useState } from 'react';
import BookerShell from '../../components/booker/BookerShell';
import { ContactForm, VenueForm } from '../../components/booker/forms';
import { EmptyState, ErrorBanner, PageHeader, SkeletonRows } from '../../components/booker/ui';
import { archiveVenue, listContacts, listShows, listVenues } from '../../lib/booker/data';
import { useLoad } from '../../lib/booker/useLoad';
import type { BookerVenue } from '../../lib/booker/types';

function VenuesContent() {
  const { data, loading, error, reload } = useLoad(async () => {
    const [venues, contacts, shows] = await Promise.all([listVenues(), listContacts(), listShows()]);
    return { venues, contacts, shows };
  });
  const [editing, setEditing] = useState<BookerVenue | 'new' | null>(null);
  const [addingContactFor, setAddingContactFor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.venues
      .filter(v => !q || `${v.name} ${v.city ?? ''} ${v.state ?? ''}`.toLowerCase().includes(q))
      .map(v => ({
        venue: v,
        contacts: data.contacts.filter(c => c.venue_id === v.id),
        shows: data.shows.filter(s => s.venue_id === v.id && s.status !== 'cancelled').length,
      }));
  }, [data, search]);

  const remove = async (id: string) => {
    setActionError('');
    try {
      await archiveVenue(id);
      setConfirmId(null);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove the venue.');
    }
  };

  return (
    <>
      <PageHeader
        title="Venues"
        sub={data ? `${data.venues.length} in your book` : undefined}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            + Add venue
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {actionError && <ErrorBanner message={actionError} />}
      {loading && !data && <SkeletonRows />}

      {data && data.venues.length === 0 && (
        <EmptyState
          title="Start your venue book"
          body="Venues you save here can be picked for any band's show, and their contacts stay private to you."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              + Add a venue
            </button>
          }
        />
      )}

      {data && data.venues.length > 0 && (
        <>
          <div className="mb-3" style={{ maxWidth: 360 }}>
            <label className="field-label" htmlFor="v-search" style={{ display: 'block', marginBottom: 4 }}>
              Search venues
            </label>
            <input id="v-search" className="input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or city" />
          </div>
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Venue</th>
                  <th scope="col">Location</th>
                  <th scope="col">Capacity</th>
                  <th scope="col">Contacts</th>
                  <th scope="col">Shows</th>
                  <th scope="col">
                    <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ venue, contacts, shows }) => (
                  <tr key={venue.id}>
                    <td>
                      <button type="button" onClick={() => setEditing(venue)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text)', fontWeight: 800, cursor: 'pointer', textAlign: 'left' }}>
                        {venue.name}
                      </button>
                    </td>
                    <td>{[venue.city, venue.state].filter(Boolean).join(', ') || '—'}</td>
                    <td>{venue.capacity ?? '—'}</td>
                    <td>
                      {contacts.length === 0 ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddingContactFor(venue.id)}>
                          + Contact
                        </button>
                      ) : (
                        contacts.map(c => c.name).join(', ')
                      )}
                    </td>
                    <td>{shows}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {confirmId === venue.id ? (
                        <>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(venue.id)}>
                            Remove
                          </button>{' '}
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>
                            Keep
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(venue.id)} aria-label={`Remove ${venue.name}`}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="table-empty">No venues match “{search}”.</div>}
          </div>
        </>
      )}

      {editing && (
        <VenueForm
          venue={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
      {addingContactFor && data && (
        <ContactForm
          venues={data.venues}
          defaultVenueId={addingContactFor}
          onClose={() => setAddingContactFor(null)}
          onSaved={() => {
            setAddingContactFor(null);
            void reload();
          }}
        />
      )}
    </>
  );
}

export default function BookerVenues() {
  return (
    <BookerShell title="Venues">
      <VenuesContent />
    </BookerShell>
  );
}
