// pages/agent/venues/[id].tsx
// One venue (or festival, fair, promoter, private-event buyer), in the Tours
// page style: illustrated hero, four trackers, then details, its contacts with
// a "Show to my bands" checkbox each, website scan, the emails sent about it
// and the shows the agent's bands have played or booked there.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import BookerShell from '../../../components/booker/BookerShell';
import ShowRow from '../../../components/booker/ShowRow';
import ComposeEmail, { type Recipient } from '../../../components/booker/ComposeEmail';
import MessageHistory from '../../../components/booker/MessageHistory';
import { ContactForm, ShowForm, VenueForm } from '../../../components/booker/forms';
import { EmptyState, ErrorBanner, SkeletonRows } from '../../../components/booker/ui';
import PageHero from '../../../components/layout/PageHero';
import MainStreetScene from '../../../components/venues/MainStreetScene';
import { archiveContact, archiveVenue, listContacts, listMessages, listRoster, listShows, listVenues, scanVenueWebsite, setContactShared } from '../../../lib/booker/data';
import { listOffers } from '../../../lib/booker/offerData';
import { OFFER_STATUS_BADGE, OFFER_STATUS_LABEL, dealSummary, offerLabel, venueOfferRecord, type BookerOffer } from '../../../lib/booker/offers';
import { formatShowDate, todayIso } from '../../../lib/booker/dates';
import { plural, venueCards } from '../../../lib/booker/summary';
import { byId, findConflicts } from '../../../lib/booker/workspace';
import { useLoad } from '../../../lib/booker/useLoad';
import { VENUE_KIND_LABEL, type BookerContact, type BookerShow } from '../../../lib/booker/types';

const FIELD_LABEL: Record<string, string> = { email: 'booking email', phone: 'phone', capacity: 'capacity', notes: 'notes' };

function VenueContent({ venueId }: { venueId: string }) {
  const router = useRouter();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const { data, loading, error, reload } = useLoad(async () => {
    const [venues, contacts, shows, bands, messages] = await Promise.all([listVenues(), listContacts(), listShows(), listRoster(), listMessages({ venueId })]);
    // Offers are extra: if they can't load, the rest of the venue page still shows.
    const offers = await listOffers({ showIds: shows.filter(s => s.venue_id === venueId).map(s => s.id) }).catch(() => [] as BookerOffer[]);
    return { venues, contacts, shows, bands, messages, offers };
  }, venueId);

  const [editingVenue, setEditingVenue] = useState(false);
  const [editingContact, setEditingContact] = useState<BookerContact | 'new' | null>(null);
  const [editingShow, setEditingShow] = useState<BookerShow | 'new' | null>(null);
  const [scan, setScan] = useState<{ state: 'idle' | 'scanning' | 'done' | 'error'; message?: string }>({ state: 'idle' });
  const [shareBusy, setShareBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [confirmContact, setConfirmContact] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [composing, setComposing] = useState<number | null>(null);
  const [sentNotice, setSentNotice] = useState('');

  const venue = data?.venues.find(v => v.id === venueId);
  const view = useMemo(() => {
    if (!data || !venue) return null;
    const contacts = data.contacts.filter(c => c.venue_id === venue.id);
    const shows = data.shows.filter(s => s.venue_id === venue.id);
    const recipients: Array<Recipient & { contactId?: string }> = [
      ...contacts.filter(c => c.email).map(c => ({ email: c.email!, name: c.name, contactId: c.id, label: c.title ? `${c.name} — ${c.title}` : c.name })),
      ...(venue.email && !contacts.some(c => c.email?.toLowerCase() === venue.email!.toLowerCase()) ? [{ email: venue.email, name: null, label: `${venue.name} booking inbox` }] : []),
    ];
    const card = venueCards([venue], data.contacts, data.shows, today)[0];
    const live = shows.filter(s => s.status !== 'cancelled' && !s.deleted_at);
    const sent = data.messages.filter(m => m.status === 'sent');
    const lastSent = sent.map(m => (m.sent_at ?? m.created_at).slice(0, 10)).sort().pop() ?? null;
    return {
      card,
      bandsHere: new Set(live.map(s => s.roster_id)).size,
      played: live.filter(s => s.status === 'played').length,
      emailsSent: sent.length,
      lastSent,
      contacts,
      recipients,
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
          <Link href="/agent/venues" className="btn btn-primary">
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
      await router.push('/agent/venues');
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
        <Link href="/agent/venues" className="text-muted">
          ← Venues &amp; Buyers
        </Link>
      </div>
      <PageHero
        title={venue.name}
        subtitle={[VENUE_KIND_LABEL[venue.kind], [venue.city, venue.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
        summary={
          view.card.lastPlayed
            ? `Last played ${formatShowDate(view.card.lastPlayed, year)} · ${plural(view.card.upcoming, 'show')} coming up.`
            : view.card.upcoming > 0
              ? `${plural(view.card.upcoming, 'show')} coming up here.`
              : 'None of your bands have played here yet.'
        }
        scene={<MainStreetScene />}
        actions={
          <div className="agent-hero-actions">
            <button type="button" className="btn btn-primary tours-new-btn" onClick={() => setEditingShow('new')} disabled={data.bands.length === 0}>
              + Book a show here
            </button>
            <button type="button" className="btn btn-secondary tours-new-btn" onClick={() => setComposing(0)}>
              ✉ Email
            </button>
            <button type="button" className="btn btn-secondary tours-new-btn" onClick={() => setEditingVenue(true)}>
              Edit details
            </button>
          </div>
        }
      />

      <section className="tours-metrics mb-6" aria-label={`${venue.name} at a glance`}>
        <div className="tour-metric">
          <span className="tour-metric-label">Shows here</span>
          <div className="tour-metric-value">
            <strong>{view.card.shows}</strong>
            <span>{view.played} played · {view.card.upcoming} coming up</span>
          </div>
          <span className="tour-metric-note">{plural(view.bandsHere, 'band')} of yours booked here</span>
        </div>
        <div className="tour-metric">
          <span className="tour-metric-label">Contacts</span>
          <div className="tour-metric-value">
            <strong>{view.contacts.length}</strong>
            <span>{view.contacts.length === 1 ? 'person' : 'people'}</span>
          </div>
          <span className="tour-metric-note">{view.card.sharedContacts > 0 ? `${view.card.sharedContacts} shown to your bands` : 'All private to you'}</span>
        </div>
        <div className="tour-metric">
          <span className="tour-metric-label">Booking email</span>
          <div className="tour-metric-value">
            <strong className={view.card.hasEmail ? undefined : 'tour-metric-hot'}>{view.recipients.length}</strong>
            <span>{view.recipients.length === 1 ? 'address' : 'addresses'} to reach</span>
          </div>
          <span className="tour-metric-note">{view.card.hasEmail ? 'Ready to email from here' : venue.website ? 'None yet — scan the website below' : 'None yet — add one in Edit details'}</span>
        </div>
        <div className="tour-metric">
          <span className="tour-metric-label">Emails sent</span>
          <div className="tour-metric-value">
            <strong>{view.emailsSent}</strong>
            <span>from your workspace</span>
          </div>
          <span className="tour-metric-note">{view.lastSent ? `Last on ${formatShowDate(view.lastSent, year)}` : 'Nothing sent yet'}</span>
        </div>
      </section>
      {actionError && <ErrorBanner message={actionError} />}
      <div aria-live="polite">
        {sentNotice && (
          <p role="status" className="card text-sm" style={{ color: 'var(--green)', borderColor: 'rgba(74,222,128,0.35)', padding: '0.7rem 1rem' }}>
            {sentNotice}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }} className="mb-6">
        {/* Details */}
        <section aria-labelledby="details-h" className="card">
          <h2 id="details-h" className="agent-card-title">
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
            <h2 id="contacts-h" className="agent-card-title">
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
                      {c.email && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setComposing(Math.max(0, view.recipients.findIndex(r => r.contactId === c.id)))}
                          aria-label={`Email ${c.name}`}
                        >
                          Email
                        </button>
                      )}
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

      <section aria-labelledby="vmail-h" className="card mb-6">
        <div className="flex items-center justify-between mb-3" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <h2 id="vmail-h" className="agent-card-title">
            Emails
          </h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setComposing(0)}>
            ✉ New email
          </button>
        </div>
        <MessageHistory messages={data.messages} onChanged={() => void reload()} emptyText="No emails sent from here yet. Emails you send to this venue’s contacts are kept here with their follow-up dates." />
      </section>

      {data.offers.length > 0 && (
        <section aria-labelledby="voffers-h" className="card mb-6">
          <h2 id="voffers-h" className="agent-card-title">
            Offers here
          </h2>
          {(() => {
            const rec = venueOfferRecord(data.offers);
            return (
              <p className="text-sm" style={{ marginTop: 0, color: 'var(--text)' }}>
                {rec.sent === 0
                  ? 'No offers sent here yet.'
                  : `${rec.sent} offer${rec.sent === 1 ? '' : 's'} sent · ${rec.accepted} accepted · ${rec.declined} declined${rec.acceptRate === null ? '' : ` · ${rec.acceptRate}% of answers were yes`}.`}
              </p>
            );
          })()}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
            {data.offers.slice(0, 20).map(o => {
              const show = data.shows.find(s => s.id === o.show_id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    className="agent-handoff-row row-link"
                    style={{ width: '100%', textAlign: 'left', cursor: show ? 'pointer' : 'default' }}
                    disabled={!show}
                    onClick={() => show && setEditingShow(show)}
                    aria-label={`${offerLabel(o)} for ${o.band_name}, ${formatShowDate(o.show_date, year)}, ${OFFER_STATUS_LABEL[o.status]}. Open the show.`}
                  >
                    <span>
                      <strong>{offerLabel(o)}</strong> · {o.band_name} · {formatShowDate(o.show_date, year)}
                      <span className="text-xs text-muted" style={{ display: 'block' }}>
                        {dealSummary(o)}
                        {o.response_note ? ` · “${o.response_note}”` : ''}
                      </span>
                    </span>
                    <span className={`badge ${OFFER_STATUS_BADGE[o.status]}`}>{OFFER_STATUS_LABEL[o.status]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="vshows-h" className="mb-6">
        <div className="agent-section-head" style={{ marginBottom: '0.75rem' }}>
          <h2 id="vshows-h" className="agent-section-title">
            Shows here
          </h2>
          <span className="agent-section-note">Upcoming first, then most recent</span>
        </div>
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
        <h2 id="vremove-h" className="agent-card-title agent-card-title--danger">
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
      {composing !== null && (
        <ComposeEmail
          recipients={view.recipients}
          defaultRecipient={composing}
          bands={data.bands}
          shows={data.shows}
          venuesById={view.venuesById}
          venueId={venue.id}
          onClose={() => setComposing(null)}
          onSent={result => {
            setComposing(null);
            setSentNotice(result.warning ?? 'Email sent. It’s saved below with its follow-up date.');
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
          defaultVenueId={venue.id}
          conflictsFor={(id, date, excludeId) => findConflicts(data.shows, id, date, excludeId)}
          otherShows={data.shows}
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
