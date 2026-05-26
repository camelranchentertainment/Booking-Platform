import React from 'react';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', minWidth: 96, fontFamily: 'var(--font-body)', paddingTop: '0.1rem', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.84rem', flex: 1 }}>{value}</span>
    </div>
  );
}

function VField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <label style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)' }}>{label}</label>
      {children}
    </div>
  );
}

interface VenueDrawerProps {
  venue: any | null;
  venueLoading: boolean;
  editingVenue: boolean;
  setEditingVenue: (v: boolean) => void;
  venueForm: any;
  setVenueForm: (updater: (f: any) => any) => void;
  previousPay: number | null;
  savingVenue: boolean;
  onSave: () => void;
  onClose: () => void;
}

export default function VenueDrawer({
  venue,
  venueLoading,
  editingVenue,
  setEditingVenue,
  venueForm,
  setVenueForm,
  previousPay,
  savingVenue,
  onSave,
  onClose,
}: VenueDrawerProps) {
  const open = !!venue;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 1000,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Drawer panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 420,
          maxWidth: '92vw',
          background: '#1e1f2e',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '-12px 0 48px rgba(0,0,0,0.6)',
          zIndex: 1001,
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          position: 'sticky', top: 0,
          background: '#1e1f2e',
          zIndex: 1,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', letterSpacing: '0.04em', color: '#fff' }}>
            {venue?.city}{venue?.state ? `, ${venue.state}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!editingVenue && !venueLoading && (
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingVenue(true)}>Edit</button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { onClose(); setEditingVenue(false); }}
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
          {venueLoading && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
          )}

          {!venueLoading && (editingVenue ? (
            /* ── Edit mode ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <VField label="Venue Name">
                <input className="input" value={venueForm.name} onChange={e => setVenueForm((f: any) => ({ ...f, name: e.target.value }))} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff' }} />
              </VField>
              <VField label="Address">
                <input className="input" value={venueForm.address} onChange={e => setVenueForm((f: any) => ({ ...f, address: e.target.value }))} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff' }} />
              </VField>
              <VField label="Phone">
                <input className="input" value={venueForm.phone} onChange={e => setVenueForm((f: any) => ({ ...f, phone: e.target.value }))} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff' }} />
              </VField>
              <VField label="Contact Name">
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input className="input" placeholder="First" value={venueForm.contact_first} onChange={e => setVenueForm((f: any) => ({ ...f, contact_first: e.target.value }))} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', flex: 1 }} />
                  <input className="input" placeholder="Last" value={venueForm.contact_last} onChange={e => setVenueForm((f: any) => ({ ...f, contact_last: e.target.value }))} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', flex: 1 }} />
                </div>
              </VField>
              <VField label="Contact Email">
                <input className="input" type="email" value={venueForm.contact_email} onChange={e => setVenueForm((f: any) => ({ ...f, contact_email: e.target.value }))} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff' }} />
              </VField>
              <VField label="Previous Pay">
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.84rem', paddingTop: '0.3rem', fontFamily: 'var(--font-body)' }}>
                  {previousPay != null ? `$${Number(previousPay).toLocaleString()} (last confirmed booking)` : 'No confirmed bookings on record'}
                </div>
              </VField>
              <VField label="Notes">
                <textarea className="textarea" rows={3} value={venueForm.notes} onChange={e => setVenueForm((f: any) => ({ ...f, notes: e.target.value }))} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', resize: 'vertical' }} />
              </VField>
              <div style={{ display: 'flex', gap: '0.6rem', paddingTop: '0.25rem' }}>
                <button className="btn btn-secondary" onClick={() => setEditingVenue(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={onSave} disabled={savingVenue}>{savingVenue ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          ) : (
            /* ── View mode ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <Row label="Venue Name" value={venueForm.name || venue?.name} />
              <Row label="Address" value={venueForm.address || '—'} />
              <Row label="Phone" value={venueForm.phone
                ? <a href={`tel:${venueForm.phone}`} style={{ color: 'var(--accent)' }}>{venueForm.phone}</a>
                : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>} />
              <Row label="Contact" value={
                (venueForm.contact_first || venueForm.contact_last)
                  ? `${venueForm.contact_first} ${venueForm.contact_last}`.trim()
                  : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
              } />
              <Row label="Contact Email" value={venueForm.contact_email
                ? <a href={`mailto:${venueForm.contact_first} ${venueForm.contact_last} <${venueForm.contact_email}>`} style={{ color: 'var(--accent)' }}>{venueForm.contact_email}</a>
                : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>} />
              <Row label="Previous Pay" value={previousPay != null
                ? <span style={{ color: '#34d399', fontWeight: 600 }}>${Number(previousPay).toLocaleString()}</span>
                : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>} />
              <Row label="Notes" value={venueForm.notes || <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
