import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getActId } from '../lib/bookingQueries';
import EmailComposer from './email/EmailComposer';
import type { OutreachStatus } from '../lib/types';

const TV_STATUS_LABELS: Record<string, string> = {
  target: 'Target', reached_out: 'Reached Out', responded: 'Responded',
  negotiating: 'Negotiating', confirmed: 'Confirmed', declined: 'Declined',
};
const TV_STATUS_COLOR: Record<string, string> = {
  target: 'var(--text-muted)', reached_out: '#c084fc', responded: '#F5A623',
  negotiating: '#fbbf24', confirmed: '#34d399', declined: '#f87171',
};
const BK_STATUS_COLOR: Record<string, string> = {
  pitch: '#94a3b8', negotiation: '#fbbf24', hold: '#f97316',
  confirmed: '#34d399', advancing: '#60a5fa', completed: '#6b7280', cancelled: '#ef4444',
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
      name:    v?.name    || '',
      address: v?.address || '',
      city:    v?.city    || '',
      state:   v?.state   || '',
      phone:   v?.phone   || '',
      website: v?.website || '',
      notes:   v?.notes   || '',
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
      name:    form.name    || null,
      address: form.address || null,
      city:    form.city    || null,
      state:   form.state   || null,
      phone:   form.phone   || null,
      website: form.website || null,
      notes:   form.notes   || null,
    }).eq('id', venue.id);
    setVenue((prev: any) => ({ ...prev, ...form }));
    setEditing(false);
    setSaving(false);
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
      const err = await res.json().catch(() => ({}));
      console.error('[VenueDrawer] tv status PATCH failed', { tvId, status, error: err });
    }
  };

  const primaryContact  = contacts[0] || null;
  const contactEmail    = primaryContact?.email || venue?.email || '';
  const activeTv        = tvs.find(t => !['declined', 'confirmed'].includes(t.status)) || tvs[0] || null;
  const genres: string[] = venue?.genre_tags || [];
  const confirmedBk     = bookings.find(b => ['confirmed', 'completed'].includes(b.status));
  const previousPay     = confirmedBk?.fee ?? null;

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const emailCategory = () => {
    if (!activeTv) return 'target';
    if (activeTv.status === 'target') return 'target';
    if (activeTv.status === 'reached_out' || activeTv.status === 'responded') return 'follow_up_1';
    return 'confirmation';
  };

  if (showEmail) {
    return (
      <EmailComposer
        tourVenueId={emailTvId}
        actId={actId || ''}
        venueId={venue?.id}
        contactEmail={contactEmail}
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
          width: 460,
          maxWidth: '94vw',
          background: '#16182a',
          borderLeft: '1px solid rgba(255,255,255,0.09)',
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
          background: '#16182a',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '1.1rem 1.4rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', letterSpacing: '0.04em', color: '#fff', lineHeight: 1.2 }}>
              {venue?.name || '—'}
            </div>
            {(venue?.city || venue?.state) && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                {[venue?.city, venue?.state].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!loading && !editing && (
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit</button>
            )}
            {!loading && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setEmailTvId(activeTv?.id); setShowEmail(true); }}
                style={{ fontSize: '0.72rem' }}
              >
                ✉ Email
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              style={{ color: 'rgba(255,255,255,0.45)', fontSize: '1.1rem', lineHeight: 1 }}
            >✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loading && (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading…</div>
          )}

          {!loading && editing ? (
            /* ─── Edit mode ─── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {[
                ['Venue Name', 'name'],
                ['Address',    'address'],
                ['City',       'city'],
                ['State',      'state'],
                ['Phone',      'phone'],
                ['Website',    'website'],
              ].map(([label, key]) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>{label}</label>
                  <input
                    className="input"
                    value={form[key]}
                    onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)' }}>Notes</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={form.notes}
                  onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))}
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', paddingTop: '0.2rem' }}>
                <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveVenue} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
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
                  {venue?.phone && (
                    <Detail label="Phone" value={
                      <a href={`tel:${venue.phone}`} style={{ color: 'var(--accent)' }}>{venue.phone}</a>
                    } />
                  )}
                  {contactEmail && (
                    <Detail label="Email" value={
                      <a href={`mailto:${contactEmail}`} style={{ color: 'var(--accent)' }}>{contactEmail}</a>
                    } />
                  )}
                  {venue?.website && (
                    <Detail label="Website" value={
                      <a href={venue.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                        {venue.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    } />
                  )}
                  {venue?.capacity && (
                    <Detail label="Capacity" value={Number(venue.capacity).toLocaleString()} />
                  )}
                  {primaryContact && (
                    <Detail label="Contact" value={`${primaryContact.first_name || ''} ${primaryContact.last_name || ''}`.trim() || '—'} />
                  )}
                </div>
              </section>

              {/* Genre tags */}
              {genres.length > 0 && (
                <section>
                  <SectionLabel>Genres</SectionLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {genres.map((g: string) => (
                      <span key={g} style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase',
                        letterSpacing: '0.06em', padding: '0.15rem 0.5rem',
                        border: '1px solid rgba(200,146,26,0.4)', color: 'var(--accent)',
                        borderRadius: '2px',
                      }}>{g}</span>
                    ))}
                  </div>
                </section>
              )}

              {/* Notes */}
              <section>
                <SectionLabel>Notes</SectionLabel>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: venue?.notes ? 'var(--text-secondary)' : 'var(--text-muted)', fontStyle: venue?.notes ? 'normal' : 'italic' }}>
                  {venue?.notes || 'No notes'}
                </div>
              </section>

              {/* Previous pay */}
              {previousPay != null && (
                <section>
                  <SectionLabel>Previous Pay</SectionLabel>
                  <span style={{ color: '#34d399', fontWeight: 600, fontSize: '0.92rem' }}>
                    ${Number(previousPay).toLocaleString()}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginLeft: '0.4rem', fontFamily: 'var(--font-body)' }}>last confirmed booking</span>
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
                        <span style={{ color: 'var(--text-muted)' }}>
                          {b.show_date ? fmtDate(b.show_date) : 'Date TBD'}
                        </span>
                        <span style={{
                          color: BK_STATUS_COLOR[b.status] || 'var(--text-muted)',
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
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(tv.tour as any)?.name || 'Unnamed Tour'}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.1rem' }}>
                            {(tv.tour as any)?.status || ''}
                          </div>
                        </div>
                        <select
                          className="select"
                          value={tv.status}
                          onChange={e => patchTvStatus(tv.id, e.target.value as OutreachStatus)}
                          style={{
                            fontSize: '0.78rem', padding: '0.25rem 0.4rem',
                            color: TV_STATUS_COLOR[tv.status] || 'var(--text-muted)',
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
                </section>
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
      letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', marginBottom: '0.5rem',
    }}>{children}</div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.76rem', minWidth: 70, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.07em', paddingTop: '0.1rem', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: '0.84rem', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}
