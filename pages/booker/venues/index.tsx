// pages/booker/venues/index.tsx
// Venues & Buyers: the agent's venue book. Venues, festivals, fairs, promoters
// and private-event buyers, each with its contacts on one profile. Search
// matches contact names and emails too, so there is no separate Contacts page.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import BookerShell from '../../../components/booker/BookerShell';
import FindVenues from '../../../components/booker/FindVenues';
import { VenueForm } from '../../../components/booker/forms';
import { EmptyState, ErrorBanner, PageHeader, SkeletonRows } from '../../../components/booker/ui';
import { listContacts, listShows, listVenues } from '../../../lib/booker/data';
import { useLoad } from '../../../lib/booker/useLoad';
import { VENUE_KINDS, VENUE_KIND_LABEL, type VenueKind } from '../../../lib/booker/types';

function VenuesContent() {
  const { data, loading, error, reload } = useLoad(async () => {
    const [venues, contacts, shows] = await Promise.all([listVenues(), listContacts(), listShows()]);
    return { venues, contacts, shows };
  });
  const [adding, setAdding] = useState(false);
  const [finding, setFinding] = useState(false);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<VenueKind | ''>('');

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.venues
      .filter(v => !kindFilter || v.kind === kindFilter)
      .map(v => ({
        venue: v,
        contacts: data.contacts.filter(c => c.venue_id === v.id),
        shows: data.shows.filter(s => s.venue_id === v.id && s.status !== 'cancelled').length,
      }))
      .filter(({ venue, contacts }) => {
        if (!q) return true;
        const hay = [venue.name, venue.city, venue.state, venue.email, ...contacts.flatMap(c => [c.name, c.email, c.title])].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
  }, [data, search, kindFilter]);

  const matchedContact = (contacts: { name: string; email: string | null }[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return contacts.find(c => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)) ?? null;
  };

  return (
    <>
      <PageHeader
        title="Venues & Buyers"
        sub={data ? `${data.venues.length} in your book` : undefined}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
              + Add manually
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setFinding(true)}>
              Find venues
            </button>
          </>
        }
      />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <SkeletonRows />}

      {data && data.venues.length === 0 && (
        <EmptyState
          title="Build your venue book"
          body="Search a city to find live-music venues, or add a venue, festival, fair or promoter yourself. Each one keeps its own contacts, and you decide which contacts your bands can see."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setFinding(true)}>
              Find venues
            </button>
          }
        />
      )}

      {data && data.venues.length > 0 && (
        <>
          <div className="mb-3" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'end' }}>
            <div style={{ flex: '1 1 260px', maxWidth: 420 }}>
              <label className="field-label" htmlFor="v-search" style={{ display: 'block', marginBottom: 4 }}>
                Search
              </label>
              <input id="v-search" className="input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Venue, city, or a contact’s name or email" />
            </div>
            <div>
              <label className="field-label" htmlFor="v-kind" style={{ display: 'block', marginBottom: 4 }}>
                Type
              </label>
              <select id="v-kind" className="select" value={kindFilter} onChange={e => setKindFilter(e.target.value as VenueKind | '')}>
                <option value="">All types</option>
                {VENUE_KINDS.map(k => (
                  <option key={k} value={k}>
                    {VENUE_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Location</th>
                  <th scope="col">Contacts</th>
                  <th scope="col">Shows</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ venue, contacts, shows }) => {
                  const hit = matchedContact(contacts);
                  return (
                    <tr key={venue.id}>
                      <td>
                        <Link href={`/booker/venues/${venue.id}`} style={{ color: 'var(--text)', fontWeight: 800 }}>
                          {venue.name}
                        </Link>
                        {hit && <div className="text-xs text-muted">Contact: {hit.name}</div>}
                      </td>
                      <td>{VENUE_KIND_LABEL[venue.kind] ?? 'Venue'}</td>
                      <td>{[venue.city, venue.state].filter(Boolean).join(', ') || '—'}</td>
                      <td>
                        {contacts.length === 0 ? <span className="text-muted">None yet</span> : contacts.length}
                        {contacts.some(c => c.share_with_bands) && <span className="text-xs text-muted"> · {contacts.filter(c => c.share_with_bands).length} shown to bands</span>}
                      </td>
                      <td>{shows}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <div className="table-empty">Nothing matches “{search}”.</div>}
          </div>
        </>
      )}

      {adding && (
        <VenueForm
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void reload();
          }}
        />
      )}
      {finding && <FindVenues onClose={() => setFinding(false)} onAdded={() => void reload()} />}
    </>
  );
}

export default function BookerVenues() {
  return (
    <BookerShell title="Venues & Buyers">
      <VenuesContent />
    </BookerShell>
  );
}
