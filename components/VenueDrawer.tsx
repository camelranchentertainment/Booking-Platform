import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getActId } from '../lib/bookingQueries';
import EmailComposer from './email/EmailComposer';
import type { OutreachStatus } from '../lib/types';

const TV_STATUS_LABELS: Record<string, string> = {
  target:    'Target',
  pitched:   'Pitched',
  waiting:   'Waiting on Response',
  follow_up: 'Follow Up',
  confirmed: 'Confirmed',
  declined:  'Declined',
};
const TV_STATUS_COLOR: Record<string, string> = {
  target:    'rgba(245,237,217,0.35)',
  pitched:   '#E8602A',
  waiting:   '#F5A623',
  follow_up: '#F5C842',
  confirmed: '#34d399',
  declined:  '#f87171',
};
const BK_STATUS_COLOR: Record<string, string> = {
  pitch:       '#94a3b8',
  negotiation: '#fbbf24',
  hold:        '#f97316',
  contract:    '#a78bfa',
  confirmed:   '#34d399',
  advancing:   '#60a5fa',
  completed:   '#6b7280',
  cancelled:   '#ef4444',
};

const PANEL_BG    = '#1a2540';
const ACCENT      = '#E8602A';
const TEXT_PRI    = '#F5EDD9';
const TEXT_MUT    = 'rgba(245,237,217,0.45)';
const INPUT_BG    = 'rgba(255,255,255,0.06)';
const BORDER      = 'rgba(255,255,255,0.08)';

const INPUT: React.CSSProperties = {
  background: INPUT_BG,
  border: `1px solid rgba(255,255,255,0.12)`,
  color: TEXT_PRI,
  borderRadius: 6,
  padding: '0.42rem 0.65rem',
  fontFamily: 'var(--font-body)',
  fontSize: '0.85rem',
  width: '100%',
  boxSizing: 'border-box',
};

interface Props {
  venueId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function VenueDrawer({ venueId, isOpen, onClose }: Props) {
  const [actId, setActId]         = useState<string | null>(null);
  const [venue, setVenue]         = useState<any>(null);
  const [contacts, setContacts]   = useState<any[]>([]);
  const [bookings, setBookings]   = useState<any[]>([]);
  const [tvs, setTvs]             = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [editing, setEditing]     = useState(false);
  const [form, setForm]           = useState<any>({});
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [emailTvId, setEmailTvId] = useState<string | undefined>(undefined);
  const [scraping, setScraping]           = useState(false);
  const [scrapeResult, setScrapeResult]   = useState<any>(null);
  const [scrapeErr, setScrapeErr]         = useState('');

  useEffect(() => {
    if (isOpen && venueId) {
      load(venueId);
    } else {
      setVenue(null);
      setEditing(false);
      setShowEmail(false);
      setScrapeResult(null);
      setScrapeErr('');
    }
  }, [isOpen, venueId]);

  const load = async (vid: string) => {
    setLoading(true);
    setEditing(false);
    setShowEmail(false);
    setSaved(false);
    setScrapeResult(null);
    setScrapeErr('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const aid = await getActId(supabase, user.id);
      setActId(aid);

      const [venueRes, contactsRes] = await Promise.all([
        supabase.from('venues').select('*').eq('id', vid).single(),
        supabase.from('contacts').select('*').eq('venue_id', vid).order('last_name'),
      ]);

      const v = venueRes.data;
      setVenue(v);
      setContacts(contactsRes.data || []);
      setForm({
        name:            v?.name            || '',
        address:         v?.address         || '',
        city:            v?.city            || '',
        state:           v?.state           || '',
        email:           v?.email           || '',
        phone:           v?.phone           || '',
        website:         v?.website         || '',
        venue_type:      v?.venue_type      || '',
        booking_contact: v?.booking_contact || '',
        capacity:        v?.capacity        || '',
        backline:        v?.backline        ?? false,
        backline_notes: v?.backline_notes || '',
        pay_notes:      v?.pay_notes      || '',
        notes:          v?.notes          || '',
      });

      if (aid) {
        const [bookingsRes, toursRes] = await Promise.all([
          supabase.from('bookings')
            .select('id, status, show_date, fee, agreed_amount')
            .eq('venue_id', vid)
            .eq('act_id', aid)
            .order('show_date', { ascending: false })
            .limit(10),
          supabase.from('tours').select('id').eq('act_id', aid),
        ]);
        setBookings(bookingsRes.data || []);

        const tourIds = toursRes.data?.map((t: any) => t.id) || [];
        if (tourIds.length > 0) {
          const tvRes = await supabase
            .from('tour_venues')
            .select('*, tour:tours(id, name, status)')
            .eq('venue_id', vid)
            .in('tour_id', tourIds)
            .order('created_at', { ascending: false });
          setTvs(tvRes.data || []);
        } else {
          setTvs([]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const saveVenue = async () => {
    if (!venue) return;
    setSaving(true);
    await supabase.from('venues').update({
      name:            form.name            || null,
      address:         form.address         || null,
      city:            form.city            || null,
      state:           form.state           || null,
      email:           form.email           || null,
      phone:           form.phone           || null,
      website:         form.website         || null,
      venue_type:      form.venue_type      || null,
      booking_contact: form.booking_contact || null,
      capacity:        form.capacity ? Number(form.capacity) : null,
      backline:        form.backline,
      backline_notes:  form.backline_notes  || null,
      pay_notes:       form.pay_notes       || null,
      notes:           form.notes           || null,
    }).eq('id', venue.id);
    setVenue((prev: any) => ({ ...prev, ...form, capacity: form.capacity ? Number(form.capacity) : null }));
    setEditing(false);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const scanWebsite = async () => {
    const websiteUrl = venue?.website;
    if (!websiteUrl) return;
    setScraping(true);
    setScrapeResult(null);
    setScrapeErr('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setScraping(false); return; }
    try {
      const res = await fetch('/api/venues/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ url: websiteUrl, venueId: venue?.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScrapeErr(data.error || 'Scan failed');
      } else {
        setScrapeResult(data);
        if (data.updated && venueId) await load(venueId);
      }
    } catch (e: any) {
      setScrapeErr(e.message || 'Scan failed');
    } finally {
      setScraping(false);
    }
  };

  const patchTvStatus = async (tvId: string, status: OutreachStatus) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/tours/venues', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ id: tvId, status }),
    });
    if (res.ok) {
      setTvs(prev => prev.map(t => t.id === tvId ? { ...t, status } : t));
    }
  };

  const primaryContact = contacts[0] || null;
  const activeTv       = tvs.find(t => !['declined', 'confirmed'].includes(t.status)) || tvs[0] || null;
  const confirmedBk    = bookings.find(b => ['confirmed', 'completed'].includes(b.status));
  const previousPay    = confirmedBk?.fee ?? confirmedBk?.agreed_amount ?? null;

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const emailCategory = () => {
    if (!activeTv) return 'target';
    if (activeTv.status === 'target')   return 'target';
    if (activeTv.status === 'pitched')  return 'follow_up_1';
    return 'confirmation';
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f: any) => ({ ...f, [k]: e.target.value }));

  if (showEmail) {
    return (
      <EmailComposer
        tourVenueId={emailTvId}
        actId={actId || ''}
        venueId={venue?.id}
        contactEmail={primaryContact?.email || venue?.email || ''}
        defaultCategory={emailCategory()}
        onClose={async (didSend?: boolean) => {
          setShowEmail(false);
          if (didSend && venueId) await load(venueId);
        }}
      />
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 1000,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.22s ease',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 380,
          maxWidth: '100vw',
          background: PANEL_BG,
          borderLeft: `1px solid ${BORDER}`,
          boxShadow: '-20px 0 60px rgba(0,0,0,0.7)',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 2,
          background: PANEL_BG,
          borderBottom: `1px solid ${BORDER}`,
          padding: '16px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div style={{ minWidth: 0, flex: 1, paddingRight: '0.5rem' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', letterSpacing: '0.04em', color: TEXT_PRI, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {venue?.name || '—'}
            </div>
            {(venue?.city || venue?.state) && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: TEXT_MUT, marginTop: '0.2rem' }}>
                {[venue?.city, venue?.state].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
            {saved && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#34d399' }}>✓ Saved</span>}
            {!loading && !editing && venue?.website && (
              <button
                onClick={scanWebsite}
                disabled={scraping}
                title="Scan website for booking contact, email, and phone"
                style={{ ...btnStyle, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}
              >{scraping ? '…' : '🔍'}</button>
            )}
            {!loading && !editing && (
              <button
                onClick={() => setEditing(true)}
                style={{ ...btnStyle, background: 'rgba(255,255,255,0.06)', color: TEXT_PRI, border: `1px solid ${BORDER}` }}
              >Edit</button>
            )}
            {!loading && (
              <button
                onClick={() => { setEmailTvId(activeTv?.id); setShowEmail(true); }}
                style={{ ...btnStyle, background: ACCENT, color: '#fff', border: 'none' }}
              >✉ Email</button>
            )}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: TEXT_MUT, fontSize: '1.2rem', cursor: 'pointer', padding: '0.1rem 0.25rem', lineHeight: 1 }}
            >✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {loading && (
            <div style={{ color: TEXT_MUT, fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading…</div>
          )}

          {!loading && editing ? (
            /* ─── Edit mode ─── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              <Field label="Venue Name">
                <input style={INPUT} value={form.name} onChange={set('name')} />
              </Field>

              <Field label="Email *">
                <input style={{ ...INPUT, borderColor: 'rgba(232,96,42,0.4)' }} type="email" value={form.email} onChange={set('email')} placeholder="booking@venue.com" />
              </Field>

              <Field label="Phone">
                <input style={INPUT} type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 555-5555" />
              </Field>

              <Field label="Website">
                <input style={INPUT} value={form.website} onChange={set('website')} placeholder="https://venue.com" />
              </Field>

              <Field label="Booking Contact">
                <input style={INPUT} value={form.booking_contact} onChange={set('booking_contact')} placeholder="e.g. Jake Smith" />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '10px' }}>
                <Field label="City">
                  <input style={INPUT} value={form.city} onChange={set('city')} />
                </Field>
                <Field label="State">
                  <input style={INPUT} value={form.state} onChange={set('state')} maxLength={2} />
                </Field>
              </div>

              <Field label="Address">
                <input style={INPUT} value={form.address} onChange={set('address')} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <Field label="Capacity">
                  <input style={INPUT} type="number" value={form.capacity} onChange={set('capacity')} placeholder="250" />
                </Field>
                <Field label="Venue Type">
                  <input style={INPUT} value={form.venue_type} onChange={set('venue_type')} placeholder="Bar, Theater…" />
                </Field>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', paddingTop: '4px' }}>
                <input
                  type="checkbox"
                  id="backline-chk"
                  checked={!!form.backline}
                  onChange={e => setForm((f: any) => ({ ...f, backline: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: ACCENT, cursor: 'pointer', flexShrink: 0 }}
                />
                <label htmlFor="backline-chk" style={{ color: TEXT_PRI, fontSize: '0.84rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Backline available
                </label>
              </div>

              <Field label="Backline Notes">
                <input style={INPUT} value={form.backline_notes} onChange={set('backline_notes')} placeholder="Guitar amp, bass amp, drum kit…" />
              </Field>

              <Field label="Pay Notes">
                <input style={INPUT} value={form.pay_notes} onChange={set('pay_notes')} placeholder="Door deal, 60/40 after $200…" />
              </Field>

              <Field label="Notes">
                <textarea
                  style={{ ...INPUT, resize: 'vertical', minHeight: '72px' }}
                  rows={3}
                  value={form.notes}
                  onChange={set('notes')}
                />
              </Field>

              <div style={{ display: 'flex', gap: '0.6rem', paddingTop: '4px' }}>
                <button onClick={() => setEditing(false)} style={{ ...btnStyle, flex: 1, background: 'rgba(255,255,255,0.06)', color: TEXT_PRI, border: `1px solid ${BORDER}`, justifyContent: 'center' }}>Cancel</button>
                <button onClick={saveVenue} disabled={saving} style={{ ...btnStyle, flex: 2, background: ACCENT, color: '#fff', border: 'none', justifyContent: 'center' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>

          ) : !loading && (
            /* ─── View mode ─── */
            <>
              {/* Contact section — always visible, critical fields first */}
              <section>
                <SectionLabel>Contact</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <Row label="Booking Contact">
                    {venue?.booking_contact
                      ? <span style={{ color: TEXT_PRI, fontWeight: 600 }}>{venue.booking_contact}</span>
                      : <span style={{ color: TEXT_MUT, fontSize: '0.8rem', fontStyle: 'italic' }}>— click Edit to add</span>}
                  </Row>
                  <Row label="Email">
                    {venue?.email
                      ? <a href={`mailto:${venue.email}`} style={{ color: ACCENT, textDecoration: 'none', wordBreak: 'break-all' }}>{venue.email}</a>
                      : venue?.website
                        ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ color: '#f87171', fontSize: '0.8rem' }}>⚠ No email</span>
                            <button
                              onClick={scanWebsite}
                              disabled={scraping}
                              style={{ ...btnStyle, padding: '0.15rem 0.45rem', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)', fontSize: '0.72rem' }}
                            >{scraping ? 'Scanning…' : '🔍 Scan Website'}</button>
                          </span>
                        )
                        : <span style={{ color: '#f87171', fontSize: '0.8rem' }}>⚠ No email — click Edit to add</span>}
                  </Row>
                  <Row label="Phone">
                    {venue?.phone
                      ? <a href={`tel:${venue.phone}`} style={{ color: ACCENT, textDecoration: 'none' }}>{venue.phone}</a>
                      : <span style={{ color: TEXT_MUT, fontSize: '0.8rem', fontStyle: 'italic' }}>—</span>}
                  </Row>
                  {venue?.website && (
                    <Row label="Website">
                      <a href={venue.website} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: 'none' }}>
                        {venue.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    </Row>
                  )}
                  {primaryContact && (
                    <Row label="Contact DB">{`${primaryContact.first_name || ''} ${primaryContact.last_name || ''}`.trim() || '—'}</Row>
                  )}
                </div>
              </section>

              {/* Scan result */}
              {(scrapeErr || scrapeResult) && (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: scrapeErr ? '1px solid rgba(248,113,113,0.3)' : '1px solid rgba(52,211,153,0.25)',
                  background: scrapeErr ? 'rgba(248,113,113,0.06)' : 'rgba(52,211,153,0.06)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8rem',
                }}>
                  {scrapeErr ? (
                    <div style={{ color: '#f87171' }}>{scrapeErr}</div>
                  ) : scrapeResult && (
                    <>
                      <div style={{ color: '#34d399', fontWeight: 700, marginBottom: '6px', fontSize: '0.78rem' }}>
                        ◈ Scan complete{scrapeResult.updated ? ' — venue record updated' : ''}{` (${scrapeResult.pagesScraped ?? 1} page${scrapeResult.pagesScraped !== 1 ? 's' : ''})`}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {[
                          ['Booking Email', scrapeResult.extracted?.booking_email],
                          ['General Email', scrapeResult.extracted?.general_email],
                          ['Phone',         scrapeResult.extracted?.booking_phone],
                          ['Contact',       scrapeResult.extracted?.booking_contact_name],
                          ['Title',         scrapeResult.extracted?.booking_contact_title],
                          ['Capacity',      scrapeResult.extracted?.capacity],
                          ['Notes',         scrapeResult.extracted?.notes],
                        ].filter(([, v]) => v).map(([label, value]) => (
                          <div key={label as string} style={{ display: 'flex', gap: '6px' }}>
                            <span style={{ color: TEXT_MUT, minWidth: 80, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                            <span style={{ color: TEXT_PRI }}>{String(value)}</span>
                          </div>
                        ))}
                        {!Object.values(scrapeResult.extracted || {}).some(Boolean) && (
                          <div style={{ color: TEXT_MUT, fontStyle: 'italic' }}>No contact info found on this website.</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Details section */}
              <section>
                <SectionLabel>Details</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {venue?.capacity && <Row label="Capacity">{Number(venue.capacity).toLocaleString()}</Row>}
                  {venue?.venue_type && <Row label="Type">{venue.venue_type}</Row>}
                  {venue?.address && <Row label="Address">{venue.address}</Row>}
                  <Row label="Backline">
                    <span style={{ color: venue?.backline ? '#34d399' : TEXT_MUT }}>
                      {venue?.backline ? '✓ Available' : '✗ None'}
                    </span>
                    {venue?.backline_notes && (
                      <span style={{ color: TEXT_MUT, fontSize: '0.8rem', display: 'block', marginTop: '2px' }}>{venue.backline_notes}</span>
                    )}
                  </Row>
                  {venue?.pay_notes && <Row label="Pay">{venue.pay_notes}</Row>}
                  {previousPay != null && (
                    <Row label="Last Pay"><span style={{ color: '#34d399', fontWeight: 600 }}>${Number(previousPay).toLocaleString()}</span></Row>
                  )}
                  {venue?.notes && <Row label="Notes"><span style={{ color: TEXT_MUT, whiteSpace: 'pre-wrap', fontSize: '0.82rem' }}>{venue.notes}</span></Row>}
                </div>
              </section>

              {/* Booking History */}
              <section>
                <SectionLabel>Booking History</SectionLabel>
                {bookings.length === 0 ? (
                  <div style={{ color: TEXT_MUT, fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontStyle: 'italic' }}>No booking history yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {bookings.map(b => (
                      <div key={b.id} style={{
                        display: 'grid', gridTemplateColumns: '1fr auto auto',
                        alignItems: 'center', gap: '8px',
                        padding: '8px 10px',
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${BORDER}`,
                        borderRadius: 6,
                        fontFamily: 'var(--font-body)', fontSize: '0.82rem',
                      }}>
                        <span style={{ color: TEXT_MUT }}>
                          {b.show_date ? fmtDate(b.show_date) : 'Date TBD'}
                        </span>
                        <span style={{
                          color: BK_STATUS_COLOR[b.status] || TEXT_MUT,
                          fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>{b.status}</span>
                        {(b.fee != null || b.agreed_amount != null) && (
                          <span style={{ color: '#34d399', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                            ${Number(b.fee ?? b.agreed_amount).toLocaleString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Tour Associations */}
              <section>
                <SectionLabel>Tour Associations</SectionLabel>
                {tvs.length === 0 ? (
                  <div style={{ color: TEXT_MUT, fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontStyle: 'italic' }}>Not in any tours yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {tvs.map(tv => (
                      <div key={tv.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 10px',
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${BORDER}`,
                        borderRadius: 6,
                        gap: '8px',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: TEXT_PRI, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(tv.tour as any)?.name || 'Unnamed Tour'}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>
                            {(tv.tour as any)?.status || ''}
                          </div>
                        </div>
                        <select
                          value={tv.status}
                          onChange={e => patchTvStatus(tv.id, e.target.value as OutreachStatus)}
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: `1px solid ${BORDER}`,
                            borderRadius: 4,
                            color: TV_STATUS_COLOR[tv.status] || TEXT_MUT,
                            fontSize: '0.76rem',
                            padding: '0.25rem 0.4rem',
                            cursor: 'pointer',
                            minWidth: 100,
                          }}
                        >
                          {Object.entries(TV_STATUS_LABELS).map(([val, lbl]) => (
                            <option key={val} value={val}>{lbl}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
  padding: '0.3rem 0.7rem',
  borderRadius: 5,
  fontSize: '0.78rem',
  fontFamily: 'var(--font-body)',
  fontWeight: 600,
  cursor: 'pointer',
  lineHeight: 1.4,
  transition: 'opacity 0.15s',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-body)',
      fontSize: '0.68rem',
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      color: '#E8602A',
      marginBottom: '10px',
      fontWeight: 700,
    }}>{children}</div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block',
        fontFamily: 'var(--font-body)',
        fontSize: '0.68rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'rgba(245,237,217,0.45)',
        marginBottom: '5px',
      }}>{label}</label>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
      <span style={{
        color: 'rgba(245,237,217,0.35)',
        fontSize: '0.72rem',
        minWidth: 68,
        fontFamily: 'var(--font-body)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        paddingTop: '2px',
        flexShrink: 0,
      }}>{label}</span>
      <span style={{ color: '#F5EDD9', fontSize: '0.84rem', wordBreak: 'break-word', flex: 1 }}>{children}</span>
    </div>
  );
}
