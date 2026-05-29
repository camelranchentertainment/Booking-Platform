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
  target:    'var(--text-muted)',
  pitched:   '#c084fc',
  waiting:   '#F5A623',
  follow_up: '#fbbf24',
  confirmed: '#34d399',
  declined:  '#f87171',
};
const BK_STATUS_COLOR: Record<string, string> = {
  pitch: '#94a3b8', negotiation: '#fbbf24', hold: '#f97316',
  confirmed: '#34d399', advancing: '#60a5fa', completed: '#6b7280', cancelled: '#ef4444',
};

const FIELD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#F5EDD9',
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

  useEffect(() => {
    if (isOpen && venueId) {
      load(venueId);
    } else {
      setVenue(null);
      setEditing(false);
      setShowEmail(false);
    }
  }, [isOpen, venueId]);

  const load = async (vid: string) => {
    setLoading(true);
    setEditing(false);
    setShowEmail(false);
    setSaved(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

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
      name:           v?.name           || '',
      address:        v?.address        || '',
      city:           v?.city           || '',
      state:          v?.state          || '',
      email:          v?.email          || '',
      phone:          v?.phone          || '',
      website:        v?.website        || '',
      capacity:       v?.capacity       || '',
      backline:       v?.backline       ?? false,
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

    setLoading(false);
  };

  const saveVenue = async () => {
    if (!venue) return;
    setSaving(true);
    await supabase.from('venues').update({
      name:           form.name           || null,
      address:        form.address        || null,
      city:           form.city           || null,
      state:          form.state          || null,
      email:          form.email          || null,
      phone:          form.phone          || null,
      website:        form.website        || null,
      capacity:       form.capacity ? Number(form.capacity) : null,
      backline:       form.backline,
      backline_notes: form.backline_notes || null,
      pay_notes:      form.pay_notes      || null,
      notes:          form.notes          || null,
    }).eq('id', venue.id);
    setVenue((prev: any) => ({ ...prev, ...form, capacity: form.capacity ? Number(form.capacity) : null }));
    setEditing(false);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
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
    } else {
      console.error('[VenueDrawer] tv status PATCH failed', { tvId, status });
    }
  };

  const primaryContact  = contacts[0] || null;
  const activeTv        = tvs.find(t => !['declined', 'confirmed'].includes(t.status)) || tvs[0] || null;
  const genres: string[] = venue?.genre_tags || [];
  const confirmedBk     = bookings.find(b => ['confirmed', 'completed'].includes(b.status));
  const previousPay     = confirmedBk?.fee ?? null;

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const emailCategory = () => {
    if (!activeTv) return 'target';
    if (activeTv.status === 'target')   return 'target';
    if (['pitched', 'waiting'].includes(activeTv.status)) return 'follow_up_1';
    return 'confirmation';
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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
          background: 'rgba(0,0,0,0.55)',
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
          width: 480,
          maxWidth: '96vw',
          background: '#0E1628',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '-16px 0 56px rgba(0,0,0,0.65)',
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
          background: '#0E1628',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '1.1rem 1.4rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', letterSpacing: '0.04em', color: '#F5EDD9', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {venue?.name || '—'}
            </div>
            {(venue?.city || venue?.state) && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(245,237,217,0.45)', marginTop: '0.15rem' }}>
                {[venue?.city, venue?.state].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            {saved && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#34d399' }}>✓ Saved</span>}
            {!loading && !editing && (
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit</button>
            )}
            {!loading && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setEmailTvId(activeTv?.id); setShowEmail(true); }}
                style={{ fontSize: '0.72rem', background: '#E8602A', border: 'none' }}
              >
                ✉ Email
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              style={{ color: 'rgba(245,237,217,0.4)', fontSize: '1.1rem', lineHeight: 1 }}
            >✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loading && (
            <div style={{ color: 'rgba(245,237,217,0.4)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading…</div>
          )}

          {!loading && editing ? (
            /* ─── Edit mode ─── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>

              <FieldLabel>Venue Name</FieldLabel>
              <input className="input" value={form.name} onChange={set('name')} style={FIELD_STYLE} />

              <FieldLabel>Address</FieldLabel>
              <input className="input" value={form.address} onChange={set('address')} style={FIELD_STYLE} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '0.5rem' }}>
                <div>
                  <FieldLabel>City</FieldLabel>
                  <input className="input" value={form.city} onChange={set('city')} style={FIELD_STYLE} />
                </div>
                <div>
                  <FieldLabel>State</FieldLabel>
                  <input className="input" value={form.state} onChange={set('state')} maxLength={2} style={FIELD_STYLE} />
                </div>
              </div>

              <FieldLabel>Email</FieldLabel>
              <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="booking@venue.com" style={FIELD_STYLE} />

              <FieldLabel>Phone</FieldLabel>
              <input className="input" type="tel" value={form.phone} onChange={set('phone')} style={FIELD_STYLE} />

              <FieldLabel>Website</FieldLabel>
              <input className="input" value={form.website} onChange={set('website')} placeholder="https://venue.com" style={FIELD_STYLE} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <FieldLabel>Booking Contact</FieldLabel>
                  <input className="input" value={primaryContact ? `${primaryContact.first_name || ''} ${primaryContact.last_name || ''}`.trim() : ''} readOnly placeholder="—" style={{ ...FIELD_STYLE, opacity: 0.55, cursor: 'not-allowed' }} title="Edit contacts via Contacts page" />
                </div>
                <div>
                  <FieldLabel>Capacity</FieldLabel>
                  <input className="input" type="number" value={form.capacity} onChange={set('capacity')} placeholder="e.g. 250" style={FIELD_STYLE} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', paddingTop: '0.1rem' }}>
                <input
                  type="checkbox"
                  id="backline-chk"
                  checked={!!form.backline}
                  onChange={e => setForm((f: any) => ({ ...f, backline: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: '#E8602A', cursor: 'pointer' }}
                />
                <label htmlFor="backline-chk" style={{ color: '#F5EDD9', fontSize: '0.84rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Backline available
                </label>
              </div>

              <FieldLabel>Backline Notes</FieldLabel>
              <input className="input" value={form.backline_notes} onChange={set('backline_notes')} placeholder="e.g. Full backline — guitar amp, bass amp, drum kit" style={FIELD_STYLE} />

              <FieldLabel>Pay Notes</FieldLabel>
              <input className="input" value={form.pay_notes} onChange={set('pay_notes')} placeholder="e.g. Door deal, 60/40 split after $200 guarantee" style={FIELD_STYLE} />

              <FieldLabel>Notes</FieldLabel>
              <textarea
                className="input"
                rows={3}
                value={form.notes}
                onChange={set('notes')}
                style={{ ...FIELD_STYLE, resize: 'vertical' }}
              />

              <div style={{ display: 'flex', gap: '0.6rem', paddingTop: '0.2rem' }}>
                <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveVenue} disabled={saving}
                  style={{ background: '#E8602A', border: 'none' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>

          ) : !loading && (
            /* ─── View mode ─── */
            <>
              {/* Contact & links */}
              <section>
                <SectionLabel>Contact</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {venue?.address && <Detail label="Address" value={venue.address} />}
                  {venue?.email && (
                    <Detail label="Email" value={
                      <a href={`mailto:${venue.email}`} style={{ color: '#E8602A' }}>{venue.email}</a>
                    } />
                  )}
                  {venue?.phone && (
                    <Detail label="Phone" value={
                      <a href={`tel:${venue.phone}`} style={{ color: '#E8602A' }}>{venue.phone}</a>
                    } />
                  )}
                  {venue?.website && (
                    <Detail label="Website" value={
                      <a href={venue.website} target="_blank" rel="noopener noreferrer" style={{ color: '#E8602A' }}>
                        {venue.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    } />
                  )}
                  {primaryContact && (
                    <Detail label="Contact" value={`${primaryContact.first_name || ''} ${primaryContact.last_name || ''}`.trim() || '—'} />
                  )}
                  {venue?.capacity && (
                    <Detail label="Capacity" value={Number(venue.capacity).toLocaleString()} />
                  )}
                </div>
              </section>

              {/* Backline */}
              {(venue?.backline || venue?.backline_notes) && (
                <section>
                  <SectionLabel>Backline</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={{ color: venue?.backline ? '#34d399' : 'rgba(245,237,217,0.45)', fontSize: '0.84rem', fontFamily: 'var(--font-body)' }}>
                      {venue?.backline ? '✓ Backline available' : '✗ No backline'}
                    </span>
                    {venue?.backline_notes && (
                      <span style={{ color: 'rgba(245,237,217,0.65)', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>{venue.backline_notes}</span>
                    )}
                  </div>
                </section>
              )}

              {/* Pay notes */}
              {venue?.pay_notes && (
                <section>
                  <SectionLabel>Pay Notes</SectionLabel>
                  <div style={{ color: 'rgba(245,237,217,0.65)', fontSize: '0.84rem', fontFamily: 'var(--font-body)' }}>{venue.pay_notes}</div>
                </section>
              )}

              {/* Genre tags */}
              {genres.length > 0 && (
                <section>
                  <SectionLabel>Genres</SectionLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {genres.map((g: string) => (
                      <span key={g} style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase',
                        letterSpacing: '0.06em', padding: '0.15rem 0.5rem',
                        border: '1px solid rgba(232,96,42,0.4)', color: '#E8602A',
                        borderRadius: '2px',
                      }}>{g}</span>
                    ))}
                  </div>
                </section>
              )}

              {/* Notes */}
              {venue?.notes && (
                <section>
                  <SectionLabel>Notes</SectionLabel>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'rgba(245,237,217,0.65)' }}>
                    {venue.notes}
                  </div>
                </section>
              )}

              {/* Previous pay */}
              {previousPay != null && (
                <section>
                  <SectionLabel>Previous Pay</SectionLabel>
                  <span style={{ color: '#34d399', fontWeight: 600, fontSize: '0.92rem' }}>
                    ${Number(previousPay).toLocaleString()}
                  </span>
                  <span style={{ color: 'rgba(245,237,217,0.35)', fontSize: '0.78rem', marginLeft: '0.4rem', fontFamily: 'var(--font-body)' }}>last confirmed booking</span>
                </section>
              )}

              {/* Booking history */}
              {bookings.length > 0 && (
                <section>
                  <SectionLabel>Booking History</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {bookings.map(b => (
                      <div key={b.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.45rem 0.6rem',
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font-body)', fontSize: '0.82rem',
                      }}>
                        <span style={{ color: 'rgba(245,237,217,0.5)' }}>
                          {b.show_date ? fmtDate(b.show_date) : 'Date TBD'}
                        </span>
                        <span style={{
                          color: BK_STATUS_COLOR[b.status] || 'rgba(245,237,217,0.45)',
                          fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                          textTransform: 'uppercase', letterSpacing: '0.07em',
                        }}>{b.status}</span>
                        {b.fee != null && (
                          <span style={{ color: '#34d399', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                            ${Number(b.fee).toLocaleString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Tour associations */}
              {tvs.length > 0 && (
                <section>
                  <SectionLabel>Tour Associations</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {tvs.map(tv => (
                      <div key={tv.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.5rem 0.6rem',
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: 'var(--radius-sm)',
                        gap: '0.6rem',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: '#F5EDD9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(tv.tour as any)?.name || 'Unnamed Tour'}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'rgba(245,237,217,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.1rem' }}>
                            {(tv.tour as any)?.status || ''}
                          </div>
                        </div>
                        <select
                          className="select"
                          value={tv.status}
                          onChange={e => patchTvStatus(tv.id, e.target.value as OutreachStatus)}
                          style={{
                            fontSize: '0.78rem', padding: '0.25rem 0.4rem',
                            color: TV_STATUS_COLOR[tv.status] || 'rgba(245,237,217,0.45)',
                            minWidth: 120,
                          }}
                        >
                          {Object.entries(TV_STATUS_LABELS).map(([val, lbl]) => (
                            <option key={val} value={val}>{lbl}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Empty state */}
              {!venue && (
                <div style={{ color: 'rgba(245,237,217,0.35)', fontSize: '0.84rem', fontFamily: 'var(--font-body)' }}>
                  Venue not found.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-body)', fontSize: '0.7rem', textTransform: 'uppercase',
      letterSpacing: '0.1em', color: 'rgba(245,237,217,0.3)', marginBottom: '0.5rem',
    }}>{children}</div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: 'block',
      fontFamily: 'var(--font-body)', fontSize: '0.7rem', textTransform: 'uppercase',
      letterSpacing: '0.08em', color: 'rgba(245,237,217,0.4)', marginBottom: '0.25rem',
    }}>{children}</label>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
      <span style={{ color: 'rgba(245,237,217,0.35)', fontSize: '0.76rem', minWidth: 70, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.07em', paddingTop: '0.1rem', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#F5EDD9', fontSize: '0.84rem', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}
