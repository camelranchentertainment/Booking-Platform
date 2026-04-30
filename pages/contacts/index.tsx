import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { ContactStatus } from '../../lib/types';
type VenuePick = { id: string; name: string; city: string; state: string };

const STATUS_LABELS: Record<ContactStatus, string> = {
  not_contacted: 'Not Contacted',
  pitched:       'Pitched',
  responded:     'Responded',
  negotiating:   'Negotiating',
  booked:        'Booked',
  declined:      'Declined',
  do_not_contact: 'DNC',
};

const STATUS_COLORS: Record<ContactStatus, string> = {
  not_contacted:  'var(--text-muted)',
  pitched:        '#818cf8',
  responded:      '#fbbf24',
  negotiating:    '#f59e0b',
  booked:         '#34d399',
  declined:       '#f87171',
  do_not_contact: '#6b7280',
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [venues, setVenues]     = useState<VenuePick[]>([]);
  const [showNew, setShowNew]   = useState(false);
  const [search, setSearch]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [form, setForm]         = useState({ first_name: '', last_name: '', title: '', email: '', phone: '', venue_id: '', notes: '' });
  const [saving, setSaving]     = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [contactsRes, venuesRes] = await Promise.all([
      supabase.from('contacts').select('*, venue:venues(id, name, city, state)').eq('agent_id', user.id).order('last_name'),
      supabase.from('venues').select('id, name, city, state').eq('agent_id', user.id).order('name'),
    ]);
    setContacts(contactsRes.data || []);
    setVenues(venuesRes.data || []);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('contacts').insert({
      agent_id:   user!.id,
      first_name: form.first_name,
      last_name:  form.last_name,
      title:      form.title    || null,
      email:      form.email    || null,
      phone:      form.phone    || null,
      venue_id:   form.venue_id || null,
      notes:      form.notes    || null,
    });
    setForm({ first_name: '', last_name: '', title: '', email: '', phone: '', venue_id: '', notes: '' });
    setShowNew(false);
    await loadAll();
    setSaving(false);
  };

  const updateStatus = async (contactId: string, status: ContactStatus) => {
    await supabase.from('contacts').update({ status, last_contact: new Date().toISOString() }).eq('id', contactId);
    setContacts(cs => cs.map(c => c.id === contactId ? { ...c, status } : c));
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    const nameMatch = !q || `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
    const statusMatch = !filterStatus || c.status === filterStatus;
    return nameMatch && statusMatch;
  });

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <div className="page-sub">{contacts.length} venue contacts</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Add Contact</button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="select" style={{ width: 180 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Venue</th><th>Email</th><th>Phone</th><th>Status</th><th>Last Contact</th></tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{c.first_name} {c.last_name}</div>
                    {c.title && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{c.title}</div>}
                  </td>
                  <td>{c.venue ? `${c.venue.name}, ${c.venue.city}` : '—'}</td>
                  <td style={{ color: 'var(--accent)', fontSize: '0.82rem' }}>{c.email || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>{c.phone || '—'}</td>
                  <td>
                    <select
                      style={{ background: 'transparent', border: 'none', color: STATUS_COLORS[c.status as ContactStatus] || 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem', letterSpacing: '0.06em', cursor: 'pointer', padding: 0 }}
                      value={c.status}
                      onChange={e => updateStatus(c.id, e.target.value as ContactStatus)}>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {c.last_contact ? new Date(c.last_contact).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>No contacts found.</div>
          )}
        </div>
      </div>

      {showNew && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Add Contact</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}>✕</button>
            </div>
            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="grid-2">
                <div className="field"><label className="field-label">First Name *</label><input className="input" value={form.first_name} onChange={set('first_name')} required autoFocus /></div>
                <div className="field"><label className="field-label">Last Name</label><input className="input" value={form.last_name} onChange={set('last_name')} /></div>
              </div>
              <div className="field"><label className="field-label">Title / Role</label><input className="input" value={form.title} onChange={set('title')} placeholder="Booking Manager, Owner..." /></div>
              <div className="field">
                <label className="field-label">Venue</label>
                <select className="select" value={form.venue_id} onChange={set('venue_id')}>
                  <option value="">No venue</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.name} — {v.city}, {v.state}</option>)}
                </select>
              </div>
              <div className="grid-2">
                <div className="field"><label className="field-label">Email</label><input className="input" type="email" value={form.email} onChange={set('email')} /></div>
                <div className="field"><label className="field-label">Phone</label><input className="input" type="tel" value={form.phone} onChange={set('phone')} /></div>
              </div>
              <div className="field"><label className="field-label">Notes</label><textarea className="textarea" value={form.notes} onChange={set('notes')} /></div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Add Contact'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
