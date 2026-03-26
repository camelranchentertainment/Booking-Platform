'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface Venue {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  booking_contact: string | null;
  venue_type: string | null;
  contact_status: string | null;
  website: string | null;
  notes: string | null;
}

// Which field is being inline-edited
interface EditingCell {
  venueId: string;
  field: 'email' | 'phone' | 'booking_contact' | 'notes';
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  not_contacted:    { bg: 'rgba(74,133,200,0.1)',  text: '#6baed6',  border: 'rgba(74,133,200,0.25)'  },
  awaiting_response:{ bg: 'rgba(245,158,11,0.1)',  text: '#f59e0b',  border: 'rgba(245,158,11,0.25)'  },
  responded:        { bg: 'rgba(167,139,250,0.1)', text: '#a78bfa',  border: 'rgba(167,139,250,0.25)' },
  booked:           { bg: 'rgba(34,197,94,0.1)',   text: '#22c55e',  border: 'rgba(34,197,94,0.25)'   },
  declined:         { bg: 'rgba(248,113,113,0.1)', text: '#f87171',  border: 'rgba(248,113,113,0.25)' },
  no_response:      { bg: 'rgba(100,116,139,0.1)', text: '#94a3b8',  border: 'rgba(100,116,139,0.25)' },
};

const STATUS_LABELS: Record<string, string> = {
  not_contacted:     'Not Contacted',
  awaiting_response: 'Awaiting Response',
  responded:         'Responded',
  booked:            'Booked',
  declined:          'Declined',
  no_response:       'No Response',
};

export default function VenueContactManager() {
  const [venues, setVenues]           = useState<Venue[]>([]);
  const [filtered, setFiltered]       = useState<Venue[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filterState, setFilterState] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [editing, setEditing]         = useState<EditingCell | null>(null);
  const [editValue, setEditValue]     = useState('');
  const [saving, setSaving]           = useState(false);
  const [states, setStates]           = useState<string[]>([]);
  const inputRef                      = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => { loadVenues(); }, []);

  useEffect(() => {
    let list = [...venues];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        v.name.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q) ||
        v.state.toLowerCase().includes(q) ||
        (v.email || '').toLowerCase().includes(q) ||
        (v.booking_contact || '').toLowerCase().includes(q)
      );
    }
    if (filterState !== 'ALL') list = list.filter(v => v.state === filterState);
    if (filterStatus !== 'ALL') list = list.filter(v => (v.contact_status || 'not_contacted') === filterStatus);
    setFiltered(list);
  }, [venues, search, filterState, filterStatus]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const loadVenues = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('venues')
        .select('id,name,city,state,address,phone,email,booking_contact,venue_type,contact_status,website,notes')
        .order('state').order('city').order('name');

      if (error) throw error;
      const list = data || [];
      setVenues(list);
      const uniqueStates = [...new Set(list.map((v: Venue) => v.state))].sort() as string[];
      setStates(uniqueStates);
    } catch (err) {
      console.error('Error loading venues:', err);
    } finally {
      setLoading(false);
    }
  };

  // Start editing a cell
  const startEdit = (venue: Venue, field: EditingCell['field']) => {
    setEditing({ venueId: venue.id, field });
    setEditValue((venue[field] as string) || '');
  };

  // Save inline edit on blur or Enter
  const commitEdit = async () => {
    if (!editing || saving) return;
    const { venueId, field } = editing;
    const current = venues.find(v => v.id === venueId);
    if (!current) { setEditing(null); return; }
    // No change
    if ((current[field] || '') === editValue.trim()) { setEditing(null); return; }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('venues')
        .update({ [field]: editValue.trim() || null })
        .eq('id', venueId);
      if (error) throw error;
      setVenues(prev => prev.map(v => v.id === venueId ? { ...v, [field]: editValue.trim() || null } : v));
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
      setEditing(null);
    }
  };

  const updateStatus = async (venueId: string, status: string) => {
    try {
      await supabase.from('venues').update({ contact_status: status }).eq('id', venueId);
      setVenues(prev => prev.map(v => v.id === venueId ? { ...v, contact_status: status } : v));
    } catch (err) { console.error('Status update error:', err); }
  };

  const missingEmail = filtered.filter(v => !v.email).length;

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 400, background: '#030d18',
        fontFamily: "'Nunito', sans-serif", color: '#3d6285', fontSize: 15,
      }}>Loading venues…</div>
    );
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .vl-wrap {
          background: #030d18;
          min-height: 100vh;
          padding: 2rem;
          font-family: 'Nunito', sans-serif;
        }

        /* ── Controls ── */
        .vl-search {
          background: rgba(9,24,40,0.9);
          border: 1px solid rgba(74,133,200,0.2);
          border-radius: 9px;
          padding: 10px 14px;
          color: #e8f1f8;
          font-family: 'Nunito', sans-serif;
          font-size: 14px;
          outline: none;
          transition: border-color .2s;
          width: 280px;
        }
        .vl-search::placeholder { color: #3d6285; }
        .vl-search:focus { border-color: rgba(74,133,200,0.5); }

        .vl-select {
          background: rgba(9,24,40,0.9);
          border: 1px solid rgba(74,133,200,0.2);
          border-radius: 9px;
          padding: 10px 14px;
          color: #e8f1f8;
          font-family: 'Nunito', sans-serif;
          font-size: 13px;
          outline: none;
          cursor: pointer;
        }
        .vl-select:focus { border-color: rgba(74,133,200,0.5); }

        /* ── Table ── */
        .vl-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0 6px;
        }
        .vl-th {
          text-align: left;
          padding: 0 14px 8px;
          font-size: 11px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.1em;
          color: #3d6285;
          border-bottom: 1px solid rgba(74,133,200,0.1);
          white-space: nowrap;
        }
        .vl-row {
          background: rgba(9,24,40,0.7);
          transition: background .15s;
        }
        .vl-row:hover { background: rgba(9,24,40,1); }
        .vl-td {
          padding: 12px 14px;
          font-size: 13px;
          color: #e8f1f8;
          border-top: 1px solid rgba(74,133,200,0.07);
          border-bottom: 1px solid rgba(74,133,200,0.07);
          vertical-align: middle;
        }
        .vl-td:first-child {
          border-left: 1px solid rgba(74,133,200,0.07);
          border-radius: 10px 0 0 10px;
        }
        .vl-td:last-child {
          border-right: 1px solid rgba(74,133,200,0.07);
          border-radius: 0 10px 10px 0;
        }

        /* ── Editable cell ── */
        .vl-editable {
          cursor: text;
          border-radius: 6px;
          padding: 5px 8px;
          min-height: 30px;
          display: flex; align-items: center;
          transition: background .15s;
          position: relative;
        }
        .vl-editable:hover {
          background: rgba(74,133,200,0.1);
        }
        .vl-editable.empty {
          color: #3d6285;
          font-style: italic;
        }
        .vl-editable.empty:hover::after {
          content: '+ Add';
          color: #4a85c8;
          font-style: normal;
          font-weight: 700;
          font-size: 12px;
          margin-left: 4px;
        }
        .vl-input {
          width: 100%;
          background: rgba(9,24,40,0.95);
          border: 1px solid rgba(74,133,200,0.5);
          border-radius: 6px;
          padding: 6px 10px;
          color: #e8f1f8;
          font-family: 'Nunito', sans-serif;
          font-size: 13px;
          outline: none;
          box-shadow: 0 0 0 3px rgba(74,133,200,0.12);
        }

        /* ── Status badge ── */
        .vl-status {
          display: inline-flex; align-items: center;
          padding: 3px 10px; border-radius: 99px;
          font-size: 11px; font-weight: 700;
          white-space: nowrap; cursor: pointer;
          border: 1px solid;
          transition: opacity .15s;
        }
        .vl-status:hover { opacity: 0.8; }

        /* ── Status dropdown ── */
        .vl-status-menu {
          position: absolute; top: calc(100% + 4px); left: 0;
          background: #091828;
          border: 1px solid rgba(74,133,200,0.2);
          border-radius: 10px; padding: 6px;
          z-index: 50; min-width: 180px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.5);
        }
        .vl-status-opt {
          display: block; width: 100%;
          padding: 8px 12px; border: none; border-radius: 7px;
          background: transparent; text-align: left;
          font-family: 'Nunito', sans-serif; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: background .12s;
        }
        .vl-status-opt:hover { background: rgba(74,133,200,0.1); }

        @media (max-width: 900px) {
          .vl-wrap { padding: 1rem; }
          .vl-search { width: 100%; }
        }
      `}</style>

      <div className="vl-wrap">
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>

          {/* ── Header ────────────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 style={{
              fontFamily: "'Bebas Neue', cursive", fontWeight: 400,
              fontSize: 'clamp(1.8rem,3vw,2.4rem)', letterSpacing: '0.06em',
              color: '#ffffff', margin: 0, lineHeight: 1,
            }}>Venue List</h1>
            <p style={{ color: '#3d6285', margin: '5px 0 0', fontSize: 13, fontWeight: 600 }}>
              {venues.length} venues total
              {missingEmail > 0 && (
                <span style={{
                  marginLeft: 12, background: 'rgba(245,158,11,0.12)',
                  border: '1px solid rgba(245,158,11,0.3)', borderRadius: 99,
                  padding: '1px 10px', color: '#f59e0b', fontSize: 12,
                }}>
                  {missingEmail} missing email
                </span>
              )}
            </p>
          </div>

          {/* ── Controls ──────────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', gap: 10, flexWrap: 'wrap',
            alignItems: 'center', marginBottom: '1.25rem',
          }}>
            <input
              className="vl-search"
              placeholder="Search venues, cities, contacts…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="vl-select" value={filterState} onChange={e => setFilterState(e.target.value)}>
              <option value="ALL">All States</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="vl-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="ALL">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span style={{ marginLeft: 'auto', color: '#3d6285', fontSize: 13, fontWeight: 600 }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* ── Tip banner ────────────────────────────────────────────────────── */}
          <div style={{
            background: 'rgba(58,127,193,0.07)',
            border: '1px solid rgba(58,127,193,0.15)',
            borderRadius: 10, padding: '10px 16px',
            marginBottom: '1.25rem',
            display: 'flex', alignItems: 'center', gap: 10,
            color: '#6baed6', fontSize: 13, fontWeight: 600,
          }}>
            <span style={{ fontSize: 16 }}>✏️</span>
            Click any email, phone, booking contact, or notes field to edit it directly in the list.
          </div>

          {/* ── Table ─────────────────────────────────────────────────────────── */}
          {filtered.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '4rem 2rem',
              border: '1px dashed rgba(74,133,200,0.18)', borderRadius: 14,
              color: '#3d6285', fontSize: 14, fontWeight: 600,
            }}>
              No venues match your filters.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="vl-table">
                <thead>
                  <tr>
                    {['Venue', 'City / State', 'Status', 'Email', 'Phone', 'Booking Contact', 'Notes'].map(h => (
                      <th key={h} className="vl-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(venue => {
                    const status = venue.contact_status || 'not_contacted';
                    const sc     = STATUS_COLORS[status] || STATUS_COLORS.not_contacted;
                    return (
                      <VenueRow
                        key={venue.id}
                        venue={venue}
                        status={status}
                        sc={sc}
                        editing={editing}
                        editValue={editValue}
                        saving={saving}
                        inputRef={inputRef}
                        onStartEdit={startEdit}
                        onEditChange={setEditValue}
                        onCommit={commitEdit}
                        onStatusChange={updateStatus}
                        onCancelEdit={() => setEditing(null)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Venue Row ────────────────────────────────────────────────────────────────
function VenueRow({
  venue, status, sc, editing, editValue, saving,
  inputRef, onStartEdit, onEditChange, onCommit, onStatusChange, onCancelEdit,
}: {
  venue: Venue;
  status: string;
  sc: { bg: string; text: string; border: string };
  editing: EditingCell | null;
  editValue: string;
  saving: boolean;
  inputRef: React.RefObject<any>;
  onStartEdit: (v: Venue, f: EditingCell['field']) => void;
  onEditChange: (val: string) => void;
  onCommit: () => void;
  onStatusChange: (id: string, status: string) => void;
  onCancelEdit: () => void;
}) {
  const [statusOpen, setStatusOpen] = useState(false);

  const isEditing = (field: EditingCell['field']) =>
    editing?.venueId === venue.id && editing.field === field;

  const EditableCell = ({
    field, value, placeholder, multiline,
  }: {
    field: EditingCell['field'];
    value: string | null;
    placeholder: string;
    multiline?: boolean;
  }) => {
    const active = isEditing(field);
    if (active) {
      return multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className="vl-input"
          value={editValue}
          rows={2}
          style={{ resize: 'vertical', minWidth: 180 }}
          onChange={e => onEditChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={e => { if (e.key === 'Escape') onCancelEdit(); }}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          className="vl-input"
          value={editValue}
          style={{ minWidth: 160 }}
          onChange={e => onEditChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={e => {
            if (e.key === 'Enter') onCommit();
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
      );
    }
    return (
      <div
        className={`vl-editable${!value ? ' empty' : ''}`}
        onClick={() => onStartEdit(venue, field)}
        title="Click to edit"
      >
        {value || placeholder}
      </div>
    );
  };

  return (
    <tr className="vl-row">
      {/* Name */}
      <td className="vl-td" style={{ minWidth: 180, maxWidth: 240 }}>
        <div style={{ fontWeight: 800, color: '#ffffff', fontSize: 13, lineHeight: 1.3 }}>
          {venue.name}
        </div>
        {venue.venue_type && (
          <div style={{ color: '#3d6285', fontSize: 11, marginTop: 2, textTransform: 'capitalize' }}>
            {venue.venue_type}
          </div>
        )}
        {venue.website && (
          <a href={venue.website} target="_blank" rel="noopener noreferrer"
            style={{ color: '#4a85c8', fontSize: 11, textDecoration: 'none' }}
            onClick={e => e.stopPropagation()}>
            Website ↗
          </a>
        )}
      </td>

      {/* City / State */}
      <td className="vl-td" style={{ whiteSpace: 'nowrap' }}>
        <div style={{ fontWeight: 700, color: '#e8f1f8', fontSize: 13 }}>{venue.city}</div>
        <div style={{ color: '#3d6285', fontSize: 11 }}>{venue.state}</div>
      </td>

      {/* Status */}
      <td className="vl-td">
        <div style={{ position: 'relative' }}>
          <span
            className="vl-status"
            style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}
            onClick={() => setStatusOpen(o => !o)}
          >
            {STATUS_LABELS[status]}
            <span style={{ marginLeft: 5, fontSize: 9 }}>▼</span>
          </span>
          {statusOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                onClick={() => setStatusOpen(false)} />
              <div className="vl-status-menu">
                {Object.entries(STATUS_LABELS).map(([k, label]) => {
                  const c = STATUS_COLORS[k];
                  return (
                    <button key={k} className="vl-status-opt" style={{ color: c.text }}
                      onClick={() => { onStatusChange(venue.id, k); setStatusOpen(false); }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </td>

      {/* Email */}
      <td className="vl-td" style={{ minWidth: 200 }}>
        <EditableCell field="email" value={venue.email} placeholder="Add email" />
      </td>

      {/* Phone */}
      <td className="vl-td" style={{ minWidth: 140 }}>
        <EditableCell field="phone" value={venue.phone} placeholder="Add phone" />
      </td>

      {/* Booking Contact */}
      <td className="vl-td" style={{ minWidth: 160 }}>
        <EditableCell field="booking_contact" value={venue.booking_contact} placeholder="Add contact" />
      </td>

      {/* Notes */}
      <td className="vl-td" style={{ minWidth: 200 }}>
        <EditableCell field="notes" value={venue.notes} placeholder="Add notes" multiline />
      </td>
    </tr>
  );
}
