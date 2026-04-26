import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { Venue, BOOKING_STATUS_LABELS } from '../../lib/types';
import { useLookup } from '../../lib/hooks/useLookup';
import Link from 'next/link';
import EmailComposer from '../../components/email/EmailComposer';

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
  const [scanUrl, setScanUrl]           = useState('');

  // Contact form
  const [showNewContact, setShowNewContact] = useState(false);
  const [contactForm, setContactForm]       = useState(BLANK_CONTACT);
  const [savingContact, setSavingContact]   = useState(false);
  const [showEmail, setShowEmail]           = useState(false);
  const [emailActId, setEmailActId]         = useState('');
  const [agentActs, setAgentActs]           = useState<{id: string; act_name: string}[]>([]);

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const [venueRes, bookingsRes, contactsRes, actsRes] = await Promise.all([
      supabase.from('venues').select('*').eq('id', id).single(),
      supabase.from('bookings').select('id, status, show_date, fee, deal_type, amount_paid, payment_status, rebook, post_show_notes, act:acts(act_name)')
        .eq('venue_id', id).order('show_date', { ascending: false }).limit(50),
      supabase.from('contacts').select('*').eq('venue_id', id).order('last_name'),
      user ? supabase.from('acts').select('id, act_name').eq('agent_id', user.id).eq('is_active', true).order('act_name') : Promise.resolve({ data: [] }),
    ]);
    if (venueRes.data) { setVenue(venueRes.data); setForm(venueRes.data); }
    setBookings(bookingsRes.data || []);
    setContacts(contactsRes.data || []);
    setAgentActs(actsRes.data || []);
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
    const url = venue?.website || scanUrl.trim();
    if (!url) return;
    setScraping(true);
    setScrapeResult(null);
    setScrapeErr('');
    try {
      // If we're using a manually entered URL and the venue has no website yet, save it first
      if (!venue?.website && scanUrl.trim() && venue?.id) {
        await supabase.from('venues').update({ website: scanUrl.trim() }).eq('id', venue.id);
      }
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/venues/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, venueId: venue?.id }),
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

  if (!venue) return <AppShell requireRole={['agent', 'act_admin']}><div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading...</div></AppShell>;

  return (
    <AppShell requireRole={['agent', 'act_admin']}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{venue.name}</h1>
          <div className="page-sub">{venue.city}, {venue.state}{venue.venue_type ? ` · ${venue.venue_type}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {venue.website ? (
            <button className="btn btn-secondary" onClick={scrapeWebsite} disabled={scraping}>
              {scraping ? '⟳ Scanning…' : '⟳ Scan Website'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="url"
                className="input"
                placeholder="https://venue.com"
                value={scanUrl}
                onChange={e => setScanUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && scanUrl.trim() && scrapeWebsite()}
                style={{ width: 220, height: 36, fontSize: '0.84rem' }}
              />
              <button className="btn btn-secondary" onClick={scrapeWebsite} disabled={scraping || !scanUrl.trim()}>
                {scraping ? '⟳ Scanning…' : '⟳ Scan'}
              </button>
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowEmail(true)}>✉ Email</button>
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
            <div className="card-header"><span className="card-title">BOOKING HISTORY ({bookings.length})</span></div>
            {bookings.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>No bookings at this venue</div>
            ) : (() => {
              const totalFee = bookings.reduce((s, b) => s + (b.fee ? Number(b.fee) : 0), 0);
              const totalPaid = bookings.reduce((s, b) => s + (b.amount_paid ? Number(b.amount_paid) : 0), 0);
              const completed = bookings.filter((b: any) => b.status === 'completed').length;
              return (
                <>
                  {/* Summary stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                    {[
                      { label: 'Shows', value: completed },
                      { label: 'Total Booked', value: totalFee ? `$${totalFee.toLocaleString()}` : '—' },
                      { label: 'Collected', value: totalPaid ? `$${totalPaid.toLocaleString()}` : '—' },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.65rem', textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--accent)', lineHeight: 1 }}>{s.value}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Act</th>
                          <th>Date</th>
                          <th>Fee</th>
                          <th>Deal</th>
                          <th>Paid</th>
                          <th>Status</th>
                          <th>Rebook</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookings.map((b: any) => (
                          <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/bookings/${b.id}`)}>
                            <td style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{b.act?.act_name || '—'}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                              {b.show_date ? new Date(b.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{b.fee ? `$${Number(b.fee).toLocaleString()}` : '—'}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{b.deal_type || '—'}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: b.amount_paid ? '#34d399' : 'var(--text-muted)' }}>
                              {b.amount_paid ? `$${Number(b.amount_paid).toLocaleString()}` : '—'}
                            </td>
                            <td><span className={`badge badge-${b.status}`} style={{ fontSize: '0.7rem' }}>{bookingLabel(b.status)}</span></td>
                            <td>
                              {b.rebook === true && <span style={{ color: '#34d399', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>✓</span>}
                              {b.rebook === false && <span style={{ color: '#f87171', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>✕</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {bookings.some((b: any) => b.post_show_notes) && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Post-Show Notes</div>
                      {bookings.filter((b: any) => b.post_show_notes).map((b: any) => (
                        <div key={b.id} style={{ background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.65rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginRight: '0.5rem' }}>
                            {b.act?.act_name} · {b.show_date ? new Date(b.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : ''}
                          </span>
                          {b.post_show_notes}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
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

      {/* Act picker → Email composer */}
      {showEmail && (
        emailActId ? (
          <EmailComposer
            actId={emailActId}
            venueId={venue.id}
            contactId={contacts[0]?.id || undefined}
            contactEmail={contacts[0]?.email || venue.email || undefined}
            defaultCategory="target"
            onClose={() => { setShowEmail(false); setEmailActId(''); }}
          />
        ) : (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#f5f3ee', borderRadius: 'var(--radius)', padding: '2rem', width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: '#1a1a2e', marginBottom: '1rem' }}>Email about which act?</div>
              {agentActs.length === 0 ? (
                <div style={{ color: '#888', fontFamily: 'var(--font-body)', fontSize: '0.84rem', marginBottom: '1rem' }}>No active acts found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                  {agentActs.map(a => (
                    <button key={a.id} onClick={() => setEmailActId(a.id)}
                      style={{ padding: '0.6rem 0.9rem', background: 'var(--bg-overlay)', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: '#1a1a2e' }}>
                      {a.act_name}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setShowEmail(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Cancel</button>
            </div>
          </div>
        )
      )}
    </AppShell>
  );
}
