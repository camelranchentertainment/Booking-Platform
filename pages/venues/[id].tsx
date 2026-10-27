// pages/venues/[id].tsx
//
// Venue profile — everything the band knows about one venue: who to book
// with, who's there on show night, the room, the band's history here, and
// the contacts at the venue.
//
// Layout (Phase 3 redesign, Oct 2026 — matches the Tours page):
//   1. Illustrated hero (main street) with the venue's town and a history line.
//   2. Metric trackers: shows played, upcoming, booked total, collected.
//   3. Left: the venue (people, details, notes) + edit form + website scan.
//      Right: contacts at the venue and the band's show history here.
//
// Roll-ups live in lib/domain/venueDetail.ts (unit-tested). Reads and writes
// go through the admin's own session; RLS is the boundary.

import { useState, useEffect, useCallback, useId } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import AppShell from '../../components/layout/AppShell';
import PageHero from '../../components/layout/PageHero';
import MainStreetScene from '../../components/venues/MainStreetScene';
import EmailComposer from '../../components/email/EmailComposer';
import ShowDayContactFields from '../../components/venues/ShowDayContactFields';
import { supabase } from '../../lib/supabase';
import { Venue, BOOKING_STATUS_LABELS } from '../../lib/types';
import { formatShowDate, localToday } from '../../lib/formatDate';
import { useLookup } from '../../lib/hooks/useLookup';
import { BLANK_SHOW_DAY_CONTACTS, contactsFromVenue, venueColumns, type ShowDayContacts } from '../../lib/showDayContacts';
import { mapsLink } from '../../lib/domain/showDay';
import {
  dealTypeLabel, money, rebookLabel, summarizeVenueHistory, telLink, venueHeroLine, websiteHref, websiteLabel,
  type VenueHistoryRow,
} from '../../lib/domain/venueDetail';
import css from '../../styles/detail.module.css';

type Contact = {
  id: string; first_name: string; last_name: string | null; title?: string | null;
  email?: string | null; phone?: string | null; notes?: string | null;
  status: string; last_contact?: string | null;
};

interface HistoryRow extends VenueHistoryRow {
  deal_type: string | null;
  post_show_notes: string | null;
  act: { act_name: string } | { act_name: string }[] | null;
}

const CONTACT_STATUS: Record<string, string> = {
  not_contacted: 'Not contacted', pitched: 'Pitched', responded: 'Responded',
  negotiate: 'Negotiating', booked: 'Booked', declined: 'Declined', do_not_contact: 'Do not contact',
};

const BLANK_CONTACT = { first_name: '', last_name: '', title: '', email: '', phone: '', notes: '' };

const actName = (b: HistoryRow): string => {
  const a = Array.isArray(b.act) ? b.act[0] : b.act;
  return a?.act_name ?? '';
};

function DateBlock({ date }: { date: string | null }) {
  if (!date) return <span className={css.date}><span className={css.dateDay}>TBD</span></span>;
  return (
    <span className={css.date} aria-hidden="true">
      <span className={css.dateMonth}>{formatShowDate(date, { month: 'short' }).toUpperCase()}</span>
      <span className={css.dateDay}>{formatShowDate(date, { day: 'numeric' })}</span>
      <span className={css.dateYear}>{formatShowDate(date, { year: 'numeric' })}</span>
    </span>
  );
}

function Person({ role, name, phone, email }: { role: string; name?: string | null; phone?: string | null; email?: string | null }) {
  if (!name && !phone && !email) return null;
  return (
    <div className={css.person}>
      <span className={css.personRole}>{role}</span>
      <p className={css.personName}>{name || '—'}</p>
      {phone && <p className={css.personLine}><a href={telLink(phone)}>{phone}</a></p>}
      {email && <p className={css.personLine}><a href={`mailto:${email}`}>{email}</a></p>}
    </div>
  );
}

export default function VenueDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;
  const { values: venueTypes } = useLookup('venue_type');
  const { values: statusValues } = useLookup('booking_status');

  const [venue, setVenue]       = useState<Venue | null>(null);
  const [missing, setMissing]   = useState(false);
  const [bookings, setBookings] = useState<HistoryRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [edit, setEdit]         = useState(false);
  const [form, setForm]         = useState<Partial<Venue>>({});
  const [showDay, setShowDay]   = useState<ShowDayContacts>(BLANK_SHOW_DAY_CONTACTS);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<{ updated?: boolean; extracted?: Record<string, unknown> } | null>(null);
  const [scrapeErr, setScrapeErr]       = useState('');
  const [scanUrl, setScanUrl]           = useState('');

  const [showNewContact, setShowNewContact] = useState(false);
  const [contactForm, setContactForm]       = useState(BLANK_CONTACT);
  const [savingContact, setSavingContact]   = useState(false);
  const [contactError, setContactError]     = useState('');
  const [showEmail, setShowEmail]           = useState(false);
  const [emailActId, setEmailActId]         = useState('');
  const [agentActs, setAgentActs]           = useState<{ id: string; act_name: string }[]>([]);
  // Local calendar day; only used after the venue loads (client side).
  const [today]                             = useState(() => localToday());

  const loadAll = useCallback(async () => {
    if (!id) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    const [venueRes, bookingsRes, contactsRes, actsRes] = await Promise.all([
      supabase.from('venues').select('*').eq('id', id).maybeSingle(),
      supabase.from('bookings')
        .select('id, status, show_date, fee, agreed_amount, deal_type, actual_amount_received, payment_status, rebook_flag, post_show_notes, act:acts(act_name)')
        .eq('venue_id', id).order('show_date', { ascending: false }).limit(50),
      supabase.from('contacts').select('*').eq('venue_id', id).order('last_name'),
      user ? supabase.from('acts').select('id, act_name').eq('owner_id', user.id).eq('is_active', true).order('act_name') : Promise.resolve({ data: [] }),
    ]);
    if (venueRes.data) {
      setVenue(venueRes.data as Venue);
      setForm(venueRes.data as Venue);
      setShowDay(contactsFromVenue(venueRes.data));
    } else {
      setMissing(true);
    }
    setBookings((bookingsRes.data || []) as HistoryRow[]);
    setContacts((contactsRes.data || []) as Contact[]);
    setAgentActs((actsRes.data || []) as { id: string; act_name: string }[]);
  }, [id]);

  useEffect(() => {
    // Fetch-on-mount: state is set from the promise, not synchronously here.
    void loadAll();
  }, [loadAll]);

  const saveEdit = async () => {
    if (!venue) return;
    if (!form.name?.trim() || !form.city?.trim() || !form.state?.trim()) {
      setSaveError('Name, city and state are required.');
      return;
    }
    setSaving(true);
    setSaveError('');
    const capacity = form.capacity === null || form.capacity === undefined || String(form.capacity) === '' ? null : Number(form.capacity);
    const { error } = await supabase.from('venues').update({
      name:       form.name.trim(),
      city:       form.city.trim(),
      state:      form.state.trim().toUpperCase(),
      address:    form.address    || null,
      phone:      form.phone      || null,
      booking_contact: form.booking_contact || null,
      ...venueColumns(showDay),
      email:      form.email      || null,
      website:    form.website    || null,
      venue_type: form.venue_type || null,
      capacity:   capacity !== null && Number.isFinite(capacity) ? capacity : null,
      notes:      form.notes      || null,
      backline:   form.backline   || null,
    }).eq('id', venue.id);
    if (error) {
      setSaveError(`Couldn’t save: ${error.message}`);
      setSaving(false);
      return;
    }
    await loadAll();
    setEdit(false);
    setSaving(false);
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venue) return;
    setSavingContact(true);
    setContactError('');
    // The band always comes from the venue row (already scoped to the caller by RLS), never from input.
    const { error } = await supabase.from('contacts').insert({
      act_id:     venue.act_id ?? null,
      venue_id:   venue.id,
      first_name: contactForm.first_name.trim(),
      last_name:  contactForm.last_name.trim()  || null,
      title:      contactForm.title.trim()      || null,
      email:      contactForm.email.trim()      || null,
      phone:      contactForm.phone.trim()      || null,
      notes:      contactForm.notes.trim()      || null,
    });
    if (error) {
      setContactError(`Couldn’t add the contact: ${error.message}`);
      setSavingContact(false);
      return;
    }
    setContactForm(BLANK_CONTACT);
    setShowNewContact(false);
    await loadAll();
    setSavingContact(false);
  };

  const updateContactStatus = async (contactId: string, status: string) => {
    const before = contacts;
    setContacts(cs => cs.map(c => c.id === contactId ? { ...c, status } : c));
    const { error } = await supabase.from('contacts').update({ status, last_contact: new Date().toISOString() }).eq('id', contactId);
    if (error) setContacts(before);
  };

  const scrapeWebsite = async () => {
    const url = venue?.website || scanUrl.trim();
    if (!url) return;
    setScraping(true);
    setScrapeResult(null);
    setScrapeErr('');
    try {
      if (!venue?.website && scanUrl.trim() && venue?.id) {
        await supabase.from('venues').update({ website: scanUrl.trim() }).eq('id', venue.id);
      }
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/venues/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, venueId: venue?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setScrapeErr(data.error || 'The scan didn’t work. Check the address and try again.'); return; }
      setScrapeResult(data);
      await loadAll();
    } catch {
      setScrapeErr('The scan didn’t work. Check your connection and try again.');
    } finally {
      setScraping(false);
    }
  };

  const set = (k: keyof Venue) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const setContact = (k: keyof typeof BLANK_CONTACT) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setContactForm(f => ({ ...f, [k]: e.target.value }));
  const bookingLabel = (status: string) =>
    statusValues.find(lv => lv.value === status)?.label ?? BOOKING_STATUS_LABELS[status as keyof typeof BOOKING_STATUS_LABELS] ?? status;

  if (missing) {
    return (
      <AppShell requireRole="band_admin">
        <p className={css.empty}>That venue isn’t in your venue book. <Link href="/venues">Back to Venues</Link></p>
      </AppShell>
    );
  }

  if (!venue) {
    return (
      <AppShell requireRole="band_admin">
        <div className={`skeleton ${css.skeleton}`} aria-busy="true"><span className="sr-only" role="status">Loading venue…</span></div>
      </AppShell>
    );
  }

  const history = summarizeVenueHistory(bookings, today || '0000-00-00');
  const fmt = (d: string) => formatShowDate(d, { month: 'short', day: 'numeric', year: 'numeric' });
  const place = [venue.city, venue.state].filter(Boolean).join(', ');
  const site = websiteHref(venue.website);
  const map = mapsLink({ name: venue.name, city: venue.city, state: venue.state, address: venue.address } as Parameters<typeof mapsLink>[0]);
  const found = Object.entries({
    'Booking email': scrapeResult?.extracted?.booking_email,
    'General email': scrapeResult?.extracted?.general_email,
    Phone:          scrapeResult?.extracted?.booking_phone,
    Contact:        scrapeResult?.extracted?.booking_contact_name,
    Title:          scrapeResult?.extracted?.booking_contact_title,
    Capacity:       scrapeResult?.extracted?.capacity,
    Type:           scrapeResult?.extracted?.venue_type,
    Notes:          scrapeResult?.extracted?.notes,
  }).filter(([, v]) => v);

  const details: Array<[string, React.ReactNode]> = [
    ['Address', venue.address ? (map ? <a href={map} target="_blank" rel="noopener noreferrer">{venue.address}</a> : venue.address) : null],
    ['Website', site && venue.website ? <a href={site} target="_blank" rel="noopener noreferrer">{websiteLabel(venue.website)}</a> : null],
    ['Capacity', venue.capacity ? `${Number(venue.capacity).toLocaleString('en-US')}` : null],
    ['Type', venue.venue_type || null],
    ['Backline', venue.backline || null],
    ['Notes', venue.notes || null],
  ];
  const shownDetails = details.filter(([, v]) => v);

  return (
    <AppShell requireRole="band_admin">
      <Link href="/venues" className={css.backLink}>← All venues</Link>
      <PageHero
        title={venue.name}
        subtitle={[place, venue.venue_type].filter(Boolean).join(' · ') || 'Venue'}
        summary={today ? venueHeroLine(history, fmt) : undefined}
        scene={<MainStreetScene />}
        actions={
          <div className={css.heroActions}>
            <Link href={`/bookings/new?venue=${venue.id}`} className="btn btn-primary tours-new-btn">+ Book this venue</Link>
            <button type="button" className="btn btn-secondary tours-new-btn" onClick={() => setShowEmail(true)}>Email</button>
          </div>
        }
      />

      <div className="tours-body">
        <section className="tours-metrics" aria-label="This venue at a glance">
          <div className="tour-metric">
            <span className="tour-metric-label">Shows played</span>
            <span className="tour-metric-value"><strong>{history.played}</strong></span>
            <span className="tour-metric-note">{history.lastPlayed ? `Last: ${fmt(history.lastPlayed)}` : 'Not yet'}</span>
          </div>
          <div className="tour-metric">
            <span className="tour-metric-label">Coming up</span>
            <span className="tour-metric-value"><strong className={history.upcoming ? 'tour-metric-hot' : ''}>{history.upcoming}</strong></span>
            <span className="tour-metric-note">{history.nextShow ? `Next: ${fmt(history.nextShow)}` : 'Nothing booked'}</span>
          </div>
          <div className="tour-metric">
            <span className="tour-metric-label">Booked here</span>
            <span className="tour-metric-value"><strong>{money(history.booked)}</strong></span>
            <span className="tour-metric-note">Agreed pay, all shows</span>
          </div>
          <div className="tour-metric">
            <span className="tour-metric-label">Collected</span>
            <span className="tour-metric-value"><strong>{money(history.collected)}</strong></span>
            <span className="tour-metric-note">
              {history.rebook.yes || history.rebook.no || history.rebook.maybe
                ? `Rebook: ${history.rebook.yes} yes · ${history.rebook.maybe} maybe · ${history.rebook.no} no`
                : 'Money actually received'}
            </span>
          </div>
        </section>

        <div className={css.layout}>
          {/* ── The venue ─────────────────────────────────────── */}
          <div className={css.column}>
            <section className={css.panel} aria-labelledby={fid('venue-title')}>
              <div className={css.panelHead}>
                <h2 className={css.panelTitle} id={fid('venue-title')}>The venue</h2>
                {!edit && (
                  <button type="button" className={`btn btn-secondary ${css.btnSmall}`} onClick={() => { setEdit(true); setSaveError(''); }}>
                    Edit
                  </button>
                )}
              </div>

              {edit ? (
                <form className={css.form} onSubmit={e => { e.preventDefault(); void saveEdit(); }}>
                  <div className={css.formGrid}>
                    <div className={`field ${css.full}`}>
                      <label className="field-label" htmlFor={fid('name')}>Name *</label>
                      <input id={fid('name')} className="input" required value={form.name || ''} onChange={set('name')} />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor={fid('city')}>City *</label>
                      <input id={fid('city')} className="input" required value={form.city || ''} onChange={set('city')} />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor={fid('state')}>State *</label>
                      <input id={fid('state')} className="input" required value={form.state || ''} onChange={set('state')} maxLength={2} />
                    </div>
                    <div className={`field ${css.full}`}>
                      <label className="field-label" htmlFor={fid('address')}>Address</label>
                      <input id={fid('address')} className="input" value={form.address || ''} onChange={set('address')} />
                    </div>
                  </div>

                  <fieldset className="venues-fieldset">
                    <legend className="venues-section-title venues-legend">Venue contact</legend>
                    <p className="venues-hint">The venue’s talent buyer or booking manager — who you book the show with.</p>
                    <div className="field">
                      <label className="field-label" htmlFor={fid('contact')}>Contact name</label>
                      <input id={fid('contact')} className="input" value={form.booking_contact || ''} onChange={set('booking_contact')} placeholder="e.g. Jess Carter" />
                    </div>
                    <div className={css.formGrid}>
                      <div className="field">
                        <label className="field-label" htmlFor={fid('email')}>Email</label>
                        <input id={fid('email')} className="input" type="email" value={form.email || ''} onChange={set('email')} />
                      </div>
                      <div className="field">
                        <label className="field-label" htmlFor={fid('phone')}>Phone</label>
                        <input id={fid('phone')} className="input" type="tel" value={form.phone || ''} onChange={set('phone')} />
                      </div>
                    </div>
                  </fieldset>

                  <ShowDayContactFields
                    idPrefix={fid('showday')}
                    value={showDay}
                    onChange={setShowDay}
                    disabled={saving}
                    hint="Who you deal with on show night. New shows here start with these filled in; changing them here doesn't change shows already booked."
                  />

                  <div className={css.formGrid}>
                    <div className="field">
                      <label className="field-label" htmlFor={fid('capacity')}>Capacity</label>
                      <input id={fid('capacity')} className="input" type="number" min="0" inputMode="numeric" value={form.capacity ?? ''} onChange={set('capacity')} />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor={fid('type')}>Venue type</label>
                      <select id={fid('type')} className="select" value={form.venue_type || ''} onChange={set('venue_type')}>
                        <option value="">—</option>
                        {venueTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className={`field ${css.full}`}>
                      <label className="field-label" htmlFor={fid('website')}>Website</label>
                      <input id={fid('website')} className="input" value={form.website || ''} onChange={set('website')} placeholder="venue.com" />
                    </div>
                    <div className={`field ${css.full}`}>
                      <label className="field-label" htmlFor={fid('backline')}>Backline</label>
                      <textarea id={fid('backline')} className="textarea" value={form.backline || ''} onChange={set('backline')} />
                    </div>
                    <div className={`field ${css.full}`}>
                      <label className="field-label" htmlFor={fid('notes')}>Notes</label>
                      <textarea id={fid('notes')} className="textarea" value={form.notes || ''} onChange={set('notes')} />
                    </div>
                  </div>
                  {saveError && <p className={css.error} role="alert">{saveError}</p>}
                  <div className={css.formActions}>
                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    <button type="button" className="btn btn-ghost" disabled={saving}
                      onClick={() => { setEdit(false); setForm(venue); setShowDay(contactsFromVenue(venue)); setSaveError(''); }}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className={css.people}>
                    <Person role="Venue contact" name={venue.booking_contact} phone={venue.phone} email={venue.email} />
                    <Person role="Day-of contact" name={venue.day_of_contact_name} phone={venue.day_of_contact_phone} />
                    <Person role="Sound engineer" name={venue.sound_engineer_name} phone={venue.sound_engineer_phone} />
                  </div>
                  {!venue.booking_contact && !venue.email && !venue.phone && (
                    <p className={css.note}>No venue contact yet. Scan their website below, or tap Edit to add one.</p>
                  )}
                  {shownDetails.length > 0 && (
                    <dl className={css.facts}>
                      {shownDetails.map(([label, value]) => (
                        <div key={label} className={css.fact}>
                          <dt className={css.factLabel}>{label}</dt>
                          <dd className={css.factValue}>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </>
              )}
            </section>

            <section className={css.panel} aria-labelledby={fid('scan-title')}>
              <div className={css.panelHead}>
                <h2 className={css.panelTitle} id={fid('scan-title')}>Find contact info</h2>
              </div>
              <p className={css.note}>Scans the venue’s website for a booking email, phone and contact, and fills in what’s missing.</p>
              <div className={css.scanRow}>
                {!venue.website && (
                  <>
                    <label className="sr-only" htmlFor={fid('scan')}>Venue website</label>
                    <input id={fid('scan')} type="url" className="input" placeholder="https://venue.com"
                      value={scanUrl} onChange={e => setScanUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && scanUrl.trim()) void scrapeWebsite(); }} />
                  </>
                )}
                <button type="button" className="btn btn-secondary" onClick={scrapeWebsite}
                  disabled={scraping || (!venue.website && !scanUrl.trim())}>
                  {scraping ? 'Scanning…' : venue.website ? `Scan ${websiteLabel(venue.website)}` : 'Scan'}
                </button>
              </div>
              <div aria-live="polite">
                {scrapeErr && <p className={css.error}>{scrapeErr}</p>}
                {scrapeResult && (
                  found.length ? (
                    <>
                      <p className={css.ok}>Scan complete{scrapeResult.updated ? ' — venue updated with what was missing.' : '.'}</p>
                      <div className={css.found}>
                        {found.map(([label, value]) => (
                          <div key={label} className={css.foundItem}>
                            <span className={css.foundLabel}>{label}</span>
                            <span className={css.foundValue}>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className={css.note}>No contact info found on that page. Try their Contact or Booking page address.</p>
                  )
                )}
              </div>
            </section>
          </div>

          {/* ── People + history ──────────────────────────────── */}
          <div className={css.column}>
            <section className={css.panel} aria-labelledby={fid('contacts-title')}>
              <div className={css.panelHead}>
                <h2 className={css.panelTitle} id={fid('contacts-title')}>Contacts</h2>
                <button type="button" className={`btn btn-secondary ${css.btnSmall}`} onClick={() => { setShowNewContact(true); setContactError(''); }}>+ Add</button>
              </div>
              {contacts.length === 0 ? (
                <p className={css.note}>No other contacts here yet.</p>
              ) : (
                <ul className={css.list}>
                  {contacts.map(c => (
                    <li key={c.id} className={css.row}>
                      <div className={css.rowText}>
                        <p className={css.rowMain}>{[c.first_name, c.last_name].filter(Boolean).join(' ')}</p>
                        {c.title && <p className={css.rowSub}>{c.title}</p>}
                        <p className={css.rowSub}>
                          {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                          {c.email && c.phone && ' · '}
                          {c.phone && <a href={telLink(c.phone)}>{c.phone}</a>}
                        </p>
                        {c.notes && <p className={css.rowSub}>{c.notes}</p>}
                      </div>
                      <label className="sr-only" htmlFor={`${fid('cs')}-${c.id}`}>Status for {c.first_name}</label>
                      <select id={`${fid('cs')}-${c.id}`} className={css.select} value={c.status} onChange={e => updateContactStatus(c.id, e.target.value)}>
                        {Object.entries(CONTACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={css.panel} aria-labelledby={fid('history-title')}>
              <div className={css.panelHead}>
                <h2 className={css.panelTitle} id={fid('history-title')}>Shows here</h2>
                <span className={css.panelMeta}>{bookings.length}</span>
              </div>
              {bookings.length === 0 ? (
                <p className={css.note}>No shows at this venue yet.</p>
              ) : (
                <ul className={css.list}>
                  {bookings.map(b => {
                    const fee = Number(b.agreed_amount ?? b.fee) || 0;
                    const paid = Number(b.actual_amount_received) || 0;
                    const rebook = rebookLabel(b.rebook_flag);
                    return (
                      <li key={b.id}>
                        <Link href={`/bookings/${b.id}`} className={`${css.row} ${css.rowLink}`}>
                          <DateBlock date={b.show_date} />
                          <span className={css.rowText}>
                            <span className={css.rowMain} style={{ display: 'block' }}>{actName(b) || 'Show'}</span>
                            <span className={css.rowSub} style={{ display: 'block' }}>
                              {[dealTypeLabel(b.deal_type), rebook, b.post_show_notes].filter(Boolean).join(' · ') || bookingLabel(b.status)}
                            </span>
                          </span>
                          <span className={css.rowRight}>
                            <span className={`badge badge-${b.status}`}>{bookingLabel(b.status)}</span>
                            <span className={css.amount}>{fee ? money(fee) : '—'}</span>
                            {paid > 0 && <span className={css.paid}>Paid {money(paid)}</span>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Add contact */}
      {showNewContact && (
        <div className="modal-backdrop" onClick={() => !savingContact && setShowNewContact(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby={fid('add-contact')} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" id={fid('add-contact')}>Add a contact at {venue.name}</h3>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={() => setShowNewContact(false)}>✕</button>
            </div>
            <form onSubmit={saveContact} className={css.form}>
              <div className={css.formGrid}>
                <div className="field">
                  <label className="field-label" htmlFor={fid('c-first')}>First name *</label>
                  <input id={fid('c-first')} className="input" value={contactForm.first_name} onChange={setContact('first_name')} required autoFocus />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={fid('c-last')}>Last name</label>
                  <input id={fid('c-last')} className="input" value={contactForm.last_name} onChange={setContact('last_name')} />
                </div>
                <div className={`field ${css.full}`}>
                  <label className="field-label" htmlFor={fid('c-title')}>Title / role</label>
                  <input id={fid('c-title')} className="input" value={contactForm.title} onChange={setContact('title')} placeholder="Talent buyer, Owner…" />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={fid('c-email')}>Email</label>
                  <input id={fid('c-email')} className="input" type="email" value={contactForm.email} onChange={setContact('email')} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={fid('c-phone')}>Phone</label>
                  <input id={fid('c-phone')} className="input" type="tel" value={contactForm.phone} onChange={setContact('phone')} />
                </div>
                <div className={`field ${css.full}`}>
                  <label className="field-label" htmlFor={fid('c-notes')}>Notes</label>
                  <textarea id={fid('c-notes')} className="textarea" value={contactForm.notes} onChange={setContact('notes')} />
                </div>
              </div>
              {contactError && <p className={css.error} role="alert">{contactError}</p>}
              <div className={css.formActions}>
                <button type="submit" className="btn btn-primary" disabled={savingContact || !contactForm.first_name.trim()}>
                  {savingContact ? 'Saving…' : 'Add contact'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewContact(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email: pick the band when the account runs more than one, then compose */}
      {showEmail && (
        emailActId || agentActs.length <= 1 ? (
          <EmailComposer
            // Owners pick among their bands; a co-admin (owns none) emails as the venue's band.
            actId={emailActId || agentActs[0]?.id || venue.act_id || ''}
            venueId={venue.id}
            contactId={contacts[0]?.id || undefined}
            contactEmail={venue.email || contacts[0]?.email || undefined}
            defaultCategory="target"
            onClose={() => { setShowEmail(false); setEmailActId(''); }}
          />
        ) : (
          <div className="modal-backdrop" onClick={() => setShowEmail(false)}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby={fid('pick-act')} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title" id={fid('pick-act')}>Email about which band?</h3>
                <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={() => setShowEmail(false)}>✕</button>
              </div>
              {agentActs.length === 0 ? (
                <p className={css.note}>No active bands found on your account.</p>
              ) : (
                <ul className={css.pickList}>
                  {agentActs.map(a => (
                    <li key={a.id}><button type="button" className={css.pickBtn} onClick={() => setEmailActId(a.id)}>{a.act_name}</button></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      )}
    </AppShell>
  );
}
