// pages/booker/contacts.tsx
// The agent's venue contacts. Private to the agent; bands never see them.

import { useMemo, useState } from 'react';
import BookerShell from '../../components/booker/BookerShell';
import { ContactForm } from '../../components/booker/forms';
import { EmptyState, ErrorBanner, PageHeader, SkeletonRows } from '../../components/booker/ui';
import { archiveContact, listContacts, listVenues } from '../../lib/booker/data';
import { byId } from '../../lib/booker/workspace';
import { useLoad } from '../../lib/booker/useLoad';
import type { BookerContact } from '../../lib/booker/types';

function ContactsContent() {
  const { data, loading, error, reload } = useLoad(async () => {
    const [contacts, venues] = await Promise.all([listContacts(), listVenues()]);
    return { contacts, venues };
  });
  const [editing, setEditing] = useState<BookerContact | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const rows = useMemo(() => {
    if (!data) return [];
    const venuesById = byId(data.venues);
    const q = search.trim().toLowerCase();
    return data.contacts
      .map(c => ({ contact: c, venue: c.venue_id ? venuesById.get(c.venue_id) : undefined }))
      .filter(({ contact, venue }) => !q || `${contact.name} ${contact.title ?? ''} ${contact.email ?? ''} ${venue?.name ?? ''}`.toLowerCase().includes(q));
  }, [data, search]);

  const remove = async (id: string) => {
    setActionError('');
    try {
      await archiveContact(id);
      setConfirmId(null);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove the contact.');
    }
  };

  return (
    <>
      <PageHeader
        title="Contacts"
        sub="Private to you"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            + Add contact
          </button>
        }
      />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {actionError && <ErrorBanner message={actionError} />}
      {loading && !data && <SkeletonRows />}

      {data && data.contacts.length === 0 && (
        <EmptyState
          title="No contacts yet"
          body="Keep your talent buyers and venue managers here. Bands you book never see your contacts."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              + Add a contact
            </button>
          }
        />
      )}

      {data && data.contacts.length > 0 && (
        <>
          <div className="mb-3" style={{ maxWidth: 360 }}>
            <label className="field-label" htmlFor="c-search" style={{ display: 'block', marginBottom: 4 }}>
              Search contacts
            </label>
            <input id="c-search" className="input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, venue or email" />
          </div>
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Venue</th>
                  <th scope="col">Email</th>
                  <th scope="col">Phone</th>
                  <th scope="col">
                    <span style={{ position: 'absolute', left: -9999 }}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ contact, venue }) => (
                  <tr key={contact.id}>
                    <td>
                      <button type="button" onClick={() => setEditing(contact)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text)', fontWeight: 800, cursor: 'pointer', textAlign: 'left' }}>
                        {contact.name}
                      </button>
                      {contact.title && <div className="text-xs text-muted">{contact.title}</div>}
                    </td>
                    <td>{venue?.name ?? '—'}</td>
                    <td>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : '—'}</td>
                    <td>{contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {confirmId === contact.id ? (
                        <>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(contact.id)}>
                            Remove
                          </button>{' '}
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>
                            Keep
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(contact.id)} aria-label={`Remove ${contact.name}`}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="table-empty">No contacts match “{search}”.</div>}
          </div>
        </>
      )}

      {editing && data && (
        <ContactForm
          contact={editing === 'new' ? undefined : editing}
          venues={data.venues}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </>
  );
}

export default function BookerContacts() {
  return (
    <BookerShell title="Contacts">
      <ContactsContent />
    </BookerShell>
  );
}
