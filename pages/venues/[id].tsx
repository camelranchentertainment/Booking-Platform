import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { Venue, Booking, BOOKING_STATUS_LABELS } from '../../lib/types';
import Link from 'next/link';

export default function VenueDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [venue, setVenue]     = useState<Venue | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [edit, setEdit]       = useState(false);
  const [form, setForm]       = useState<Partial<Venue>>({});
  const [saving, setSaving]   = useState(false);

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    const [venueRes, bookingsRes] = await Promise.all([
      supabase.from('venues').select('*').eq('id', id).single(),
      supabase.from('bookings').select(`id, status, show_date, fee, act:acts(act_name)`).eq('venue_id', id).order('show_date', { ascending: false }).limit(20),
    ]);
    if (venueRes.data) { setVenue(venueRes.data); setForm(venueRes.data); }
    setBookings(bookingsRes.data || []);
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

  const set = (k: keyof Venue) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  if (!venue) return <AppShell requireRole="agent"><div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>Loading...</div></AppShell>;

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">{venue.name}</h1>
          <div className="page-sub">{venue.city}, {venue.state}{venue.venue_type ? ` · ${venue.venue_type}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={() => setEdit(!edit)}>Edit</button>
          <Link href={`/bookings/new?venue=${venue.id}`} className="btn btn-primary">+ Book Venue</Link>
        </div>
      </div>

      <div className="grid-2">
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
                <div className="field"><label className="field-label">Venue Type</label><input className="input" value={form.venue_type || ''} onChange={set('venue_type')} /></div>
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
              {[
                ['Address', venue.address],
                ['Phone',   venue.phone],
                ['Email',   venue.email],
                ['Website', venue.website],
                ['Capacity', venue.capacity ? `${venue.capacity.toLocaleString()} cap` : null],
                ['Backline', venue.backline],
                ['Notes',   venue.notes],
              ].filter(([_,v]) => v).map(([label, value]) => (
                <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                  <span style={{ color: 'var(--text-secondary)', textAlign: 'right', maxWidth: '65%' }}>{
                    label === 'Website' || label === 'Email'
                      ? <a href={label === 'Email' ? `mailto:${value}` : String(value)} target="_blank" style={{ color: 'var(--accent)' }}>{value}</a>
                      : value
                  }</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">BOOKING HISTORY</span></div>
          {bookings.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>No bookings at this venue</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {bookings.map((b: any) => (
                <Link key={b.id} href={`/bookings/${b.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.6rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', textDecoration: 'none' }}>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500 }}>{b.act?.act_name || '—'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                      {b.show_date ? new Date(b.show_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      {b.fee ? ` · $${Number(b.fee).toLocaleString()}` : ''}
                    </div>
                  </div>
                  <span className={`badge badge-${b.status}`}>{BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
