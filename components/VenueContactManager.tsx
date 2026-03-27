'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

interface EnrichStatus {
  totalVenues: number;
  missingEmail: number;
  enriched: number;
  job: {
    running: boolean;
    totalMissing: number;
    processed: number;
    found: number;
    currentVenue: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
  };
}

type EditField = 'email' | 'phone' | 'booking_contact' | 'notes';

// Single state object for the active inline edit
interface ActiveEdit {
  venueId: string;
  field: EditField;
  value: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  not_contacted:     { bg: 'rgba(74,133,200,0.1)',  text: '#6baed6',  border: 'rgba(74,133,200,0.25)'  },
  awaiting_response: { bg: 'rgba(245,158,11,0.1)',  text: '#f59e0b',  border: 'rgba(245,158,11,0.25)'  },
  responded:         { bg: 'rgba(167,139,250,0.1)', text: '#a78bfa',  border: 'rgba(167,139,250,0.25)' },
  booked:            { bg: 'rgba(34,197,94,0.1)',   text: '#22c55e',  border: 'rgba(34,197,94,0.25)'   },
  declined:          { bg: 'rgba(248,113,113,0.1)', text: '#f87171',  border: 'rgba(248,113,113,0.25)' },
  no_response:       { bg: 'rgba(100,116,139,0.1)', text: '#94a3b8',  border: 'rgba(100,116,139,0.25)' },
};

const STATUS_LABELS: Record<string, string> = {
  not_contacted:     'Not Contacted',
  awaiting_response: 'Awaiting Response',
  responded:         'Responded',
  booked:            'Booked',
  declined:          'Declined',
  no_response:       'No Response',
};

// ─── Main component ────────────────────────────────────────────────────────────

export default function VenueContactManager() {
  const [venues, setVenues]             = useState<Venue[]>([]);
  const [filtered, setFiltered]         = useState<Venue[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterState, setFilterState]   = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [states, setStates]             = useState<string[]>([]);

  // ── Inline editing ────────────────────────────────────────────────────────
  const [activeEdit, setActiveEdit]   = useState<ActiveEdit | null>(null);
  const [savedCell, setSavedCell]     = useState<{ venueId: string; field: EditField } | null>(null);

  // Refs so callbacks are stable (never stale-closed over state)
  const activeEditRef  = useRef(activeEdit);
  const venuesRef      = useRef(venues);
  const committingRef  = useRef(false); // mutex: prevents blur double-commit

  // Keep refs current on every render (synchronous, not in useEffect)
  activeEditRef.current = activeEdit;
  venuesRef.current     = venues;

  // ── Enrichment state ──────────────────────────────────────────────────────
  const [enrichStatus, setEnrichStatus]     = useState<EnrichStatus | null>(null);
  const [enrichStarting, setEnrichStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadVenues = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('venues')
        .select('id,name,city,state,address,phone,email,booking_contact,venue_type,contact_status,website,notes')
        .order('state').order('city').order('name');
      if (error) throw error;
      const list = (data || []) as Venue[];
      setVenues(list);
      setStates([...new Set(list.map(v => v.state))].sort());
    } catch (err) {
      console.error('Error loading venues:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadVenues(); }, [loadVenues]);

  // ── Filter ────────────────────────────────────────────────────────────────

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
    if (filterState !== 'ALL')  list = list.filter(v => v.state === filterState);
    if (filterStatus !== 'ALL') list = list.filter(v => (v.contact_status || 'not_contacted') === filterStatus);
    setFiltered(list);
  }, [venues, search, filterState, filterStatus]);

  // ── Inline edit callbacks (all stable — read state via refs) ─────────────

  const startEdit = useCallback((venueId: string, field: EditField, current: string) => {
    committingRef.current = false; // reset mutex when opening a new cell
    setActiveEdit({ venueId, field, value: current });
  }, []);

  const changeEdit = useCallback((value: string) => {
    setActiveEdit(prev => prev ? { ...prev, value } : null);
  }, []);

  const cancelEdit = useCallback(() => {
    committingRef.current = false;
    setActiveEdit(null);
  }, []);

  const commitEdit = useCallback(async () => {
    // Mutex: if a commit is already in flight (e.g. Enter then blur), skip
    if (committingRef.current) return;

    const edit = activeEditRef.current;
    if (!edit) return;

    const { venueId, field, value } = edit;
    const trimmed = value.trim();

    // No-op: value unchanged
    const original = venuesRef.current.find(v => v.id === venueId);
    if (!original || (original[field] || '') === trimmed) {
      setActiveEdit(null);
      return;
    }

    // Acquire mutex and close input immediately so blur can't re-trigger this
    committingRef.current = true;
    setActiveEdit(null);

    try {
      const { error } = await supabase
        .from('venues')
        .update({ [field]: trimmed || null })
        .eq('id', venueId);
      if (error) throw error;

      setVenues(prev =>
        prev.map(v => v.id === venueId ? { ...v, [field]: trimmed || null } : v)
      );

      // Flash green checkmark for 1.5 s
      setSavedCell({ venueId, field });
      setTimeout(() => setSavedCell(null), 1500);
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      committingRef.current = false;
    }
  }, []); // stable — all reads go through refs

  // ── Status update ─────────────────────────────────────────────────────────

  const updateStatus = useCallback(async (venueId: string, status: string) => {
    try {
      await supabase.from('venues').update({ contact_status: status }).eq('id', venueId);
      setVenues(prev => prev.map(v => v.id === venueId ? { ...v, contact_status: status } : v));
    } catch (err) { console.error('Status update error:', err); }
  }, []);

  // ── Enrichment ────────────────────────────────────────────────────────────

  const fetchEnrichStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/venues/enrich-status');
      if (!res.ok) return;
      const data: EnrichStatus = await res.json();
      setEnrichStatus(prev => {
        if (prev?.job.running && !data.job.running) loadVenues();
        return data;
      });
      if (!data.job.running && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch { /* ignore */ }
  }, [loadVenues]);

  const startEnrichment = useCallback(async () => {
    if (enrichStarting || enrichStatus?.job.running) return;
    setEnrichStarting(true);
    try {
      await fetch('/api/venues/enrich-emails', { method: 'POST' });
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(fetchEnrichStatus, 2000);
      await fetchEnrichStatus();
    } catch { /* ignore */ } finally {
      setEnrichStarting(false);
    }
  }, [enrichStarting, enrichStatus?.job.running, fetchEnrichStatus]);

  useEffect(() => {
    fetchEnrichStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchEnrichStatus]);

  useEffect(() => {
    if (enrichStatus?.job.running && !pollRef.current) {
      pollRef.current = setInterval(fetchEnrichStatus, 2000);
    }
  }, [enrichStatus?.job.running, fetchEnrichStatus]);

  // ─────────────────────────────────────────────────────────────────────────

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
          user-select: none;
        }
        .vl-editable:hover { background: rgba(74,133,200,0.1); }
        .vl-editable.empty { color: #3d6285; font-style: italic; }
        .vl-editable.empty:hover::after {
          content: '+ Add';
          color: #4a85c8; font-style: normal;
          font-weight: 700; font-size: 12px;
          margin-left: 4px;
        }
        .vl-editable.saved {
          background: rgba(34,197,94,0.08);
          border-radius: 6px;
          transition: background .3s;
        }

        /* ── Active input ── */
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
        .vl-input:focus {
          border-color: rgba(74,133,200,0.8);
          box-shadow: 0 0 0 3px rgba(74,133,200,0.18);
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

        /* ── Enrich button ── */
        .vl-enrich-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 18px; border-radius: 9px;
          background: rgba(245,158,11,0.15);
          border: 1px solid rgba(245,158,11,0.4);
          color: #f59e0b;
          font-family: 'Nunito', sans-serif; font-size: 13px; font-weight: 800;
          cursor: pointer; transition: background .15s, border-color .15s;
          white-space: nowrap;
        }
        .vl-enrich-btn:hover:not(:disabled) {
          background: rgba(245,158,11,0.25);
          border-color: rgba(245,158,11,0.6);
        }
        .vl-enrich-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .vl-enrich-pulse {
          width: 8px; height: 8px; border-radius: 50%;
          background: #f59e0b;
          animation: vl-pulse 1s ease-in-out infinite;
          flex-shrink: 0;
        }
        @keyframes vl-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
        .vl-enrich-bar-wrap {
          background: rgba(245,158,11,0.08);
          border: 1px solid rgba(245,158,11,0.2);
          border-radius: 10px; padding: 12px 16px;
          margin-bottom: 1rem;
          font-size: 13px; font-weight: 600; color: #f59e0b;
        }
        .vl-enrich-bar-track {
          height: 4px; border-radius: 99px;
          background: rgba(245,158,11,0.15);
          margin-top: 8px; overflow: hidden;
        }
        .vl-enrich-bar-fill {
          height: 100%; border-radius: 99px;
          background: #f59e0b;
          transition: width .4s ease;
        }

        @media (max-width: 1023px) {
          .vl-wrap { padding: 1.25rem; }
          .vl-search { width: 100%; }
          .vl-th, .vl-td { padding: 10px 10px; font-size: 12px; }
        }
        @media (max-width: 767px) {
          .vl-wrap { padding: 1rem; }
          .vl-search { width: 100%; }
          .vl-controls { flex-direction: column; align-items: stretch !important; }
          .vl-controls > * { width: 100%; }
          .vl-enrich-btn { width: 100%; justify-content: center; min-height: 44px; }
          .vl-select { width: 100%; }
          /* Keep table scrollable on mobile - reduce column widths */
          .vl-th, .vl-td { padding: 8px 8px; font-size: 12px; white-space: normal; }
          .vl-th { white-space: nowrap; }
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
          <div className="vl-controls" style={{
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

            {/* ── Enrich button ── */}
            {enrichStatus && enrichStatus.missingEmail > 0 && !enrichStatus.job.running && (
              <button className="vl-enrich-btn" onClick={startEnrichment} disabled={enrichStarting}>
                <span style={{ fontSize: 15 }}>✦</span>
                {enrichStarting
                  ? 'Starting…'
                  : `${enrichStatus.missingEmail} missing email${enrichStatus.missingEmail !== 1 ? 's' : ''} · Auto-find →`}
              </button>
            )}
            {enrichStatus?.job.running && (
              <button className="vl-enrich-btn" disabled>
                <span className="vl-enrich-pulse" />
                Finding emails… {enrichStatus.job.found} found
              </button>
            )}

            <span style={{ marginLeft: 'auto', color: '#3d6285', fontSize: 13, fontWeight: 600 }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* ── Enrichment progress banner ─────────────────────────────────────── */}
          {enrichStatus?.job.running && (
            <div className="vl-enrich-bar-wrap">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <span className="vl-enrich-pulse" style={{ display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} />
                  Auto-finding emails
                  {enrichStatus.job.currentVenue && (
                    <span style={{ color: '#fbbf24', marginLeft: 8 }}>· {enrichStatus.job.currentVenue}</span>
                  )}
                </span>
                <span style={{ color: '#fbbf24' }}>
                  {enrichStatus.job.processed} / {enrichStatus.job.totalMissing} checked · {enrichStatus.job.found} found
                </span>
              </div>
              <div className="vl-enrich-bar-track">
                <div className="vl-enrich-bar-fill" style={{
                  width: enrichStatus.job.totalMissing > 0
                    ? `${Math.round((enrichStatus.job.processed / enrichStatus.job.totalMissing) * 100)}%`
                    : '0%',
                }} />
              </div>
            </div>
          )}

          {/* ── Enrichment completion flash ────────────────────────────────────── */}
          {enrichStatus?.job.finishedAt && !enrichStatus.job.running && enrichStatus.job.found > 0 && (() => {
            const age = Date.now() - new Date(enrichStatus.job.finishedAt!).getTime();
            if (age > 30_000) return null;
            return (
              <div style={{
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                borderRadius: 10, padding: '10px 16px', marginBottom: '1rem',
                display: 'flex', alignItems: 'center', gap: 10,
                color: '#22c55e', fontSize: 13, fontWeight: 700,
              }}>
                ✓ Found {enrichStatus.job.found} email{enrichStatus.job.found !== 1 ? 's' : ''} across {enrichStatus.job.processed} venues
              </div>
            );
          })()}

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
                        activeEdit={activeEdit}
                        savedCell={savedCell}
                        onStartEdit={startEdit}
                        onChange={changeEdit}
                        onCommit={commitEdit}
                        onCancel={cancelEdit}
                        onStatusChange={updateStatus}
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

// ─── VenueRow ─────────────────────────────────────────────────────────────────
// Defined at module level so React never treats it as a new component type
// between renders — this is what prevents input remounting on every keystroke.

function VenueRow({
  venue, status, sc, activeEdit, savedCell,
  onStartEdit, onChange, onCommit, onCancel, onStatusChange,
}: {
  venue: Venue;
  status: string;
  sc: { bg: string; text: string; border: string };
  activeEdit: ActiveEdit | null;
  savedCell: { venueId: string; field: EditField } | null;
  onStartEdit: (venueId: string, field: EditField, current: string) => void;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [statusOpen, setStatusOpen] = useState(false);

  // Helper: is this specific cell currently being edited?
  const isActive = (field: EditField) =>
    activeEdit?.venueId === venue.id && activeEdit.field === field;

  // Helper: did this cell just save successfully?
  const isSaved = (field: EditField) =>
    savedCell?.venueId === venue.id && savedCell.field === field;

  // Renders either the live input or the display value for a given field
  const renderCell = (
    field: EditField,
    value: string | null,
    placeholder: string,
    opts: { multiline?: boolean; minWidth?: number } = {}
  ) => {
    if (isActive(field)) {
      // Input is rendered directly here — NOT inside a sub-component.
      // This keeps it as part of VenueRow's stable component tree so React
      // updates it in-place on every keystroke rather than unmounting it.
      return opts.multiline ? (
        <textarea
          className="vl-input"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={activeEdit!.value}
          rows={2}
          style={{ resize: 'vertical', minWidth: opts.minWidth ?? 180 }}
          onChange={e => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
        />
      ) : (
        <input
          className="vl-input"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={activeEdit!.value}
          style={{ minWidth: opts.minWidth ?? 160 }}
          onChange={e => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={e => {
            if (e.key === 'Enter')  onCommit();
            if (e.key === 'Escape') onCancel();
          }}
        />
      );
    }

    const saved = isSaved(field);
    return (
      <div
        className={`vl-editable${!value ? ' empty' : ''}${saved ? ' saved' : ''}`}
        onClick={() => onStartEdit(venue.id, field, value || '')}
        title="Click to edit"
      >
        {saved ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#22c55e', fontWeight: 800, fontSize: 14 }}>✓</span>
            <span style={{ color: '#e8f1f8' }}>{value}</span>
          </span>
        ) : (value || placeholder)}
      </div>
    );
  };

  return (
    <tr className="vl-row">
      {/* Venue name */}
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

      <td className="vl-td" style={{ minWidth: 200 }}>
        {renderCell('email', venue.email, 'Add email')}
      </td>

      <td className="vl-td" style={{ minWidth: 140 }}>
        {renderCell('phone', venue.phone, 'Add phone')}
      </td>

      <td className="vl-td" style={{ minWidth: 160 }}>
        {renderCell('booking_contact', venue.booking_contact, 'Add contact')}
      </td>

      <td className="vl-td" style={{ minWidth: 200 }}>
        {renderCell('notes', venue.notes, 'Add notes', { multiline: true })}
      </td>
    </tr>
  );
}
