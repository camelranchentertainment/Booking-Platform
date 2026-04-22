import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { Venue, BOOKING_STATUS_LABELS } from '../../lib/types';
import { useLookup } from '../../lib/hooks/useLookup';
import Link from 'next/link';

type Contact = {
  id: string; first_name: string; last_name: string; title?: string | null;
  email?: string | null; phone?: string | null; notes?: string | null;
  status: string; last_contact?: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  not_contacted: 'var(--text-muted)', pitched: '#818cf8', responded: '#fbbf24',
  negotiating: '#f59e0b', booked: '#34d399', declined: '#f87171', do_not_contact: '#6b7280',
};
const STATUS_LABELS: Record<string, string> = {
  not_contacted: 'Not Contacted', pitched: 'Pitched', responded: 'Responded',
  negotiating: 'Negotiating', booked: 'Booked', declined: 'Declined', do_not_contact: 'DNC',
};

const BLANK_CONTACT = { first_name: '', last_name: '', title: '', email: '', phone: '', notes: '' };

export default function VenueDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { values: venueTypes } = useLookup('venue_type');
  const { values: statusValues } = useLookup('booking_status');

  const [venue, setVenue]       = useState<Venue | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [edit, setEdit]         = useState(false);
  const [form, setForm]         = useState<Partial<Venue>>({});
  const [saving, setSaving]     = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<any>(null);
  const [scrapeErr, setScrapeErr]       = useState('');

  // Contact form
  const [showNewContact, setShowNewContact] = useState(false);
  const [contactForm, setContactForm]       = useState(BLANK_CONTACT);
  const [savingContact, setSavingContact]   = useState(false);

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    const [venueRes, bookingsRes, contactsRes] = await Promise.all([
      supabase.from('venues').select('*').eq('id', id).single(),
      supabase.from('bookings').select('id, status, show_date, fee, act:acts(act_name)')
        .eq('venue_id', id).order('show_date', { ascending: false }).limit(20),
      supabase.from('contacts').select('*').eq('venue_id', id).order('last_name'),
    ]);
    if (venueRes.data) { setVenue(venueRes.data); setForm(venueRes.data); }
    setBookings(bookingsRes.data || []);
    setContacts(contactsRes.data || []);
  };

  const saveEdit = async () => {
    if (!venue) return;
    setSaving(true);
    await supabase.from('venues').update({
      name:       form.name,
      city:       form.city,
      state:      form.state,
      address:    form.address    || null,
      phone:      form.phone      || null,
      email:      form.email      || null,
      website:    form.website    || null,
      venue_type: form.venue_type || null,
      capacity:   form.capacity   || null,
      notes:      form.notes      || null,
      backline:   form.backline   || null,
    }).eq('id', venue.id);
    await loadAll();
    setEdit(false);
    setSaving(false);
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingContact(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('contacts').insert({
      agent_id:   user!.id,
      venue_id:   id,
      first_name: contactForm.first_name,
      last_name:  contactForm.last_name  || null,
      title:      contactForm.title      || null,
      email:      contactForm.email      || null,
      phone:      contactForm.phone      || null,
      notes:      contactForm.notes      || null,
    });
    setContactForm(BLANK_CONTACT);
    setShowNewContact(false);
    await loadAll();
    setSavingContact(false);
  };

  const updateContactStatus = async (contactId: string, status: string) => {
    await supabase.from('contacts').update({ status, last_contact: new Date().toISOString() }).eq('id', contactId);
    setContacts(cs => cs.map(c => c.id === contactId ? { ...c, status } : c));
  };

  const scrapeWebsite = async () => {
    if (!venue?.website) return;
    setScraping(true);
    setScrapeResult(null);
    setScrapeErr('');
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/venues/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: venue.website, venueId: venue.id }),
      });
      const data = await res.json();
      if (!res.ok) { setScrapeErr(data.error || 'Scrape failed'); return; }
      setScrapeResult(data);
      await loadAll();
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

  if (!venue) return <AppShell requireRole="agent"><div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading...</div></AppShell>;

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">{venue.name}</h1>
          <div className="page-sub">{venue.city}, {venue.state}{venue.venue_type ? ` · ${venue.venue_type}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {venue.website && (
            <button className="btn btn-secondary" onClick={scrapeWebsite} disabled={scraping}>
              {scraping ? '⟳ Scanning…' : '⟳ Scan Website'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setEdit(!edit)}>Edit</button>
          <Link href={`/bookings/new?venue=${venue.id}`} className="btn btn-primary">+ Book Venue</Link>
        </div>
      </div>

      {/* Firecrawl scan results */}
      {(scrapeErr || scrapeResult) && (
        <div style={{ marginBottom: '1.25rem', border: scrapeErr ? '1px solid rgba(248,113,113,0.3)' : '1px solid var(--neon-border)', borderRadius: '4px', padding: '1rem', background: scrapeErr ? 'rgba(248,113,113,0.05)' : 'var(--accent-glow)' }}>
          {scrapeErr ? (
            <div style={{ color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>{scrapeErr}</div>
          ) : scrapeResult && (
            <div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.75rem' }}>
                ◈ Website Scan Complete{scrapeResult.updated ? ' — venue record updated' : ''}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                {([
                  ['Booking Email', scrapeResult.extracted?.booking_email],
                  ['General Email', scrapeResult.extracted?.general_email],
                  ['Phone',         scrapeResult.extracted?.booking_phone],
                  ['Contact',       scrapeResult.extracted?.booking_contact_name],
                  ['Title',         scrapeResult.extracted?.booking_contact_title],
                  ['Capacity',      scrapeResult.extracted?.capacity],
                  ['Type',          scrapeResult.extracted?.venue_type],
                  ['Notes',         scrapeResult.extracted?.notes],
                ] as [string, any][]).filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ background: 'var(--bg-overlay)', borderRadius: '3px', padding: '0.5rem 0.65rem' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>{label}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{String(value)}</div>
                  </div>
                ))}
              </div>
              {!Object.values(scrapeResult.extracted || {}).some(Boolean) && (
                <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>No contact info found on this page.</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Venue Info */}
        <div className="card">
          <div className="card-header"><span className="card-title">VENUE INFO</span></div>
          {edit ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field"><label className="field-label">Name</label><input className="input" value={form.name || ''} onChange={set('name')} /></div>
              <div className="grid-2">
                <div className="field"><label className="field-label">City</label><input className="input" value={form.city || ''} onChange={set('city')} /></div>
                <div className="field"><label className="field-label">State</label><input className="input" value={form.state || ''} onChange={set('state')} maxLength={2} /></div>
              </div>
              <div className="field"><label className="field-label">Address</label><input className="input" value={form.address || ''} onChange={set('address')} /></div>
              <div className="grid-2">
                <div className="field"><label className="field-label">Email</label><input className="input" type="email" value={form.email || ''} onChange={set('email')} /></div>
                <div className="field"><label className="field-label">Phone</label><input className="input" value={form.phone || ''} onChange={set('phone')} /></div>
              </div>
              <div className="grid-2">
                <div className="field"><label className="field-label">Capacity</label><input className="input" type="number" value={form.capacity || ''} onChange={set('capacity')} /></div>
                <div className="field">
                  <label className="field-label">Venue Type</label>
                  <select className="select" value={form.venue_type || ''} onChange={set('venue_type')}>
                    <option value="">—</option>
                    {venueTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="field"><label className="field-label">Website</label><input className="input" value={form.website || ''} onChange={set('website')} /></div>
              <div className="field"><label className="field-label">Backline</label><textarea className="textarea" value={form.backline || ''} onChange={set('backline')} /></div>
              <div className="field"><label className="field-label">Notes</label><textarea className="textarea" value={form.notes || ''} onChange={set('notes')} /></div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setEdit(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>Save</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem' }}>
              {([
                ['Address',  venue.address],
                ['Phone',    venue.phone],
                ['Email',    venue.email],
                ['Website',  venue.website],
                ['Capacity', venue.capacity ? `${venue.capacity.toLocaleString()} cap` : null],
                ['Backline', venue.backline],
                ['Notes',    venue.notes],
              ] as [string, any][]).filter(([, v]) => v).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                  <span style={{ color: 'var(--text-secondary)', textAlign: 'right', maxWidth: '65%' }}>
                    {label === 'Website' || label === 'Email'
                      ? <a href={label === 'Email' ? `mailto:${value}` : String(value)} target="_blank" style={{ color: 'var(--accent)' }}>{value}</a>
                      : value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Contacts */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">CONTACTS ({contacts.length})</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowNewContact(true)}>+ Add</button>
            </div>
            {contacts.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
                No contacts yet. <button className="btn btn-ghost btn-sm" style={{ padding: '0', color: 'var(--accent)' }} onClick={() => setShowNewContact(true)}>Add one →</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {contacts.map(c => (
                  <div key={c.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.65rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{c.first_name} {c.last_name}</div>
                        {c.title && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.title}</div>}
                        <div style={{ marginTop: '0.2rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                          {c.email && <a href={`mailto:${c.email}`} style={{ color: 'var(--accent)' }}>{c.email}</a>}
                          {c.phone && <span>{c.phone}</span>}
                        </div>
                      </div>
                      <select
                        style={{ background: 'transparent', border: 'none', color: STATUS_COLORS[c.status] || 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', letterSpacing: '0.06em', cursor: 'pointer', flexShrink: 0 }}
                        value={c.status}
                        onChange={e => updateContactStatus(c.id, e.target.value)}>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    {c.notes && <div style={{ marginTop: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{c.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Booking History */}
          <div className="card">
            <div className="card-header"><span className="card-title">BOOKING HISTORY</span></div>
            {bookings.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>No bookings at this venue</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {bookings.map((b: any) => (
                  <Link key={b.id} href={`/bookings/${b.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.6rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', textDecoration: 'none' }}>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500 }}>{b.act?.act_name || '—'}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>
                        {b.show_date ? new Date(b.show_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        {b.fee ? ` · $${Number(b.fee).toLocaleString()}` : ''}
                      </div>
                    </div>
                    <span className={`badge badge-${b.status}`}>{bookingLabel(b.status)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Contact Modal */}
      {showNewContact && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Add Contact</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewContact(false)}>✕</button>
            </div>
            <form onSubmit={saveContact} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--accent)', letterSpacing: '0.08em' }}>
                {venue.name}
              </div>
              <div className="grid-2">
                <div className="field"><label className="field-label">First Name *</label><input className="input" value={contactForm.first_name} onChange={setContact('first_name')} required autoFocus /></div>
                <div className="field"><label className="field-label">Last Name</label><input className="input" value={contactForm.last_name} onChange={setContact('last_name')} /></div>
              </div>
              <div className="field"><label className="field-label">Title / Role</label><input className="input" value={contactForm.title} onChange={setContact('title')} placeholder="Booking Manager, Owner..." /></div>
              <div className="grid-2">
                <div className="field"><label className="field-label">Email</label><input className="input" type="email" value={contactForm.email} onChange={setContact('email')} /></div>
                <div className="field"><label className="field-label">Phone</label><input className="input" type="tel" value={contactForm.phone} onChange={setContact('phone')} /></div>
              </div>
              <div className="field"><label className="field-label">Notes</label><textarea className="textarea" value={contactForm.notes} onChange={setContact('notes')} /></div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewContact(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingContact}>{savingContact ? 'Saving...' : 'Add Contact'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
