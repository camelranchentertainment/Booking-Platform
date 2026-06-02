import { useState, useEffect, useMemo } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { getActId } from '../lib/bookingQueries';

const DEAL_LABELS: Record<string, string> = {
  guarantee:  'Guarantee',
  door_split: 'Door Split',
  percentage: 'Percentage',
  flat_fee:   'Flat Fee',
  other:      'Other',
};
const PAY_COLORS: Record<string, string> = {
  pending:  '#f97316',
  partial:  '#fbbf24',
  received: '#34d399',
  waived:   '#60a5fa',
};

function Stars({ value, onChange }: { value: number | null; onChange?: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1,2,3,4,5].map(n => (
        <span
          key={n}
          style={{
            cursor: onChange ? 'pointer' : 'default',
            color: n <= (hover || value || 0) ? '#fbbf24' : 'var(--text-muted)',
            fontSize: '1rem', lineHeight: 1,
          }}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange && onChange(n)}
        >★</span>
      ))}
    </span>
  );
}

type EditState = {
  bookingId: string;
  attendance: string;
  actual_amount_received: string;
  rating: number | null;
  would_return: boolean | null;
  venue_feedback: string;
  post_show_notes: string;
  rebook_flag: string;
};

export default function HistoryPage() {
  const [bookings, setBookings]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [token, setToken]             = useState('');
  const [role, setRole]               = useState('');
  const [filterVenue, setFilterVenue] = useState('');
  const [filterYear, setFilterYear]   = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterRating, setFilterRating] = useState('');
  const [filterReturn, setFilterReturn] = useState('');
  const [editModal, setEditModal]     = useState<EditState | null>(null);
  const [saving, setSaving]           = useState(false);
  const [saveErr, setSaveErr]         = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const tok = session?.access_token || '';
    setToken(tok);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: prof } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
    setRole(prof?.role || '');
    const actId = await getActId(supabase, user.id);
    if (!actId) { setLoading(false); return; }
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, show_date, deal_type, agreed_amount, fee,
        actual_amount_received, payment_status, status,
        post_show_notes, rebook_flag,
        rating, attendance, would_return, venue_feedback,
        venue:venues(id, name, city, state)
      `)
      .eq('act_id', actId)
      .neq('status', 'cancelled')
      .not('show_date', 'is', null)
      .lt('show_date', today)
      .order('show_date', { ascending: false });
    if (error) console.error('History query error:', error);
    setBookings((data || []) as any[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let list = bookings;
    if (filterVenue)  list = list.filter(b => b.venue?.name?.toLowerCase().includes(filterVenue.toLowerCase()));
    if (filterState)  list = list.filter(b => b.venue?.state === filterState);
    if (filterYear)   list = list.filter(b => b.show_date?.startsWith(filterYear));
    if (filterRating) list = list.filter(b => (b.rating || 0) >= parseInt(filterRating, 10));
    if (filterReturn === 'yes') list = list.filter(b => b.would_return === true || b.rebook_flag === 'yes');
    if (filterReturn === 'no')  list = list.filter(b => b.would_return === false || b.rebook_flag === 'no');
    return list;
  }, [bookings, filterVenue, filterState, filterYear, filterRating, filterReturn]);

  const years  = [...new Set(bookings.map(b => b.show_date?.slice(0, 4)).filter(Boolean))].sort().reverse();
  const states = [...new Set(bookings.map(b => b.venue?.state).filter(Boolean))].sort();

  const totalVenues   = new Set(filtered.map(b => b.venue?.id).filter(Boolean)).size;
  const totalStates   = new Set(filtered.map(b => b.venue?.state).filter(Boolean)).size;
  const ratedBookings = filtered.filter(b => b.rating);
  const avgRating     = ratedBookings.length > 0
    ? (ratedBookings.reduce((s: number, b: any) => s + b.rating, 0) / ratedBookings.length).toFixed(1)
    : '—';
  const wouldReturn   = filtered.filter(b => b.would_return === true || b.rebook_flag === 'yes').length;
  const returnPct     = filtered.length > 0 ? Math.round((wouldReturn / filtered.length) * 100) : 0;

  // Venue intelligence — rank by rating + would_return
  const venueMap: Record<string, {
    id: string; name: string; city: string; state: string;
    shows: number; totalPay: number; ratings: number[]; returns: number;
  }> = {};
  for (const b of bookings) {
    const key = b.venue?.id;
    if (!key) continue;
    if (!venueMap[key]) venueMap[key] = { id: key, name: b.venue.name, city: b.venue.city, state: b.venue.state, shows: 0, totalPay: 0, ratings: [], returns: 0 };
    venueMap[key].shows++;
    venueMap[key].totalPay += Number(b.actual_amount_received ?? b.agreed_amount ?? b.fee) || 0;
    if (b.rating) venueMap[key].ratings.push(b.rating);
    if (b.would_return === true || b.rebook_flag === 'yes') venueMap[key].returns++;
  }
  const venueIntel = Object.values(venueMap)
    .map(v => ({
      ...v,
      avgPay:    v.shows > 0 ? Math.round(v.totalPay / v.shows) : 0,
      avgRating: v.ratings.length > 0 ? v.ratings.reduce((s, r) => s + r, 0) / v.ratings.length : 0,
      score:     v.ratings.length > 0
        ? (v.ratings.reduce((s, r) => s + r, 0) / v.ratings.length) + (v.returns / v.shows) * 2
        : v.shows,
    }))
    .filter(v => v.shows > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const openEdit = (b: any) => {
    setEditModal({
      bookingId:              b.id,
      attendance:             b.attendance != null ? String(b.attendance) : '',
      actual_amount_received: b.actual_amount_received != null ? String(b.actual_amount_received) : '',
      rating:                 b.rating || null,
      would_return:           b.would_return ?? (b.rebook_flag === 'yes' ? true : b.rebook_flag === 'no' ? false : null),
      venue_feedback:         b.venue_feedback || '',
      post_show_notes:        b.post_show_notes || '',
      rebook_flag:            b.rebook_flag || '',
    });
    setSaveErr('');
  };

  const saveEdit = async () => {
    if (!editModal || !token) return;
    setSaving(true);
    setSaveErr('');
    const res = await fetch('/api/bookings/update-postgig', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        bookingId:              editModal.bookingId,
        attendance:             editModal.attendance ? parseInt(editModal.attendance, 10) : null,
        actual_amount_received: editModal.actual_amount_received ? parseFloat(editModal.actual_amount_received) : null,
        rating:                 editModal.rating,
        would_return:           editModal.would_return,
        venue_feedback:         editModal.venue_feedback || null,
        post_show_notes:        editModal.post_show_notes || null,
        rebook_flag:            editModal.rebook_flag || null,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      setSaveErr(err.error || 'Save failed');
      setSaving(false);
      return;
    }
    setSaving(false);
    setEditModal(null);
    await load();
  };

  const exportCSV = () => {
    const headers = ['Date', 'Venue', 'City', 'State', 'Deal', 'Agreed', 'Received', 'Payment', 'Rating', 'Would Return', 'Notes'];
    const lines = filtered.map(b => [
      b.show_date || '',
      b.venue?.name || '',
      b.venue?.city || '',
      b.venue?.state || '',
      DEAL_LABELS[b.deal_type] || b.deal_type || '',
      b.agreed_amount ?? b.fee ?? '',
      b.actual_amount_received ?? '',
      b.payment_status || '',
      b.rating ?? '',
      b.would_return != null ? (b.would_return ? 'Yes' : 'No') : (b.rebook_flag || ''),
      (b.post_show_notes || '').replace(/,/g, ';'),
    ]);
    const csv = [headers, ...lines].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'show-history.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <AppShell requireRole={['band_admin', 'member', 'superadmin']}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Show History</h1>
          <div className="page-sub">{filtered.length} past show{filtered.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}>↓ Export CSV</button>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {[
          ['Total Shows', filtered.length],
          ['Venues Played', totalVenues],
          ['States', totalStates],
          ['Avg Rating', avgRating],
          ['Would Return', `${returnPct}%`],
        ].map(([label, val]) => (
          <div key={label as string} className="stat-block" style={{ flex: '1 1 120px', minWidth: 100 }}>
            <div className="stat-value" style={{ fontSize: '1.2rem' }}>{val}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card mb-6" style={{ padding: '0.85rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, minWidth: 150 }}>
            <label className="field-label">Venue</label>
            <input className="input" placeholder="Search venue…" value={filterVenue} onChange={e => setFilterVenue(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0, minWidth: 100 }}>
            <label className="field-label">Year</label>
            <select className="select" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              <option value="">All Years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 110 }}>
            <label className="field-label">State</label>
            <select className="select" value={filterState} onChange={e => setFilterState(e.target.value)}>
              <option value="">All States</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 120 }}>
            <label className="field-label">Min Rating</label>
            <select className="select" value={filterRating} onChange={e => setFilterRating(e.target.value)}>
              <option value="">Any Rating</option>
              <option value="4">4+ Stars</option>
              <option value="3">3+ Stars</option>
              <option value="2">2+ Stars</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 120 }}>
            <label className="field-label">Would Return</label>
            <select className="select" value={filterReturn} onChange={e => setFilterReturn(e.target.value)}>
              <option value="">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          {(filterVenue || filterYear || filterState || filterRating || filterReturn) && (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }}
              onClick={() => { setFilterVenue(''); setFilterYear(''); setFilterState(''); setFilterRating(''); setFilterReturn(''); }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Show cards */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 90 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
          No past shows found. Shows appear here once their date has passed.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '2rem' }}>
          {filtered.map(b => {
            const amount = b.actual_amount_received ?? b.agreed_amount ?? b.fee;
            const wouldRet = b.would_return != null ? b.would_return : (b.rebook_flag === 'yes' ? true : b.rebook_flag === 'no' ? false : null);
            return (
              <div key={b.id} className="card" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                      {b.venue?.name || '—'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {b.venue?.city}{b.venue?.state ? `, ${b.venue.state}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {b.show_date ? new Date(b.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </div>
                    {amount && (
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)', marginTop: '0.1rem' }}>
                        {DEAL_LABELS[b.deal_type] || b.deal_type || ''} · ${Number(amount).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.65rem', paddingTop: '0.65rem', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <Stars value={b.rating} />
                  {b.attendance && (
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      👥 {b.attendance}
                    </span>
                  )}
                  {wouldRet != null && (
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: wouldRet ? '#34d399' : '#f87171' }}>
                      🔄 Would Return: {wouldRet ? 'Yes' : 'No'}
                    </span>
                  )}
                  {b.payment_status && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: PAY_COLORS[b.payment_status] || 'var(--text-muted)' }}>
                      {b.payment_status}
                    </span>
                  )}
                  {b.status !== 'completed' && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f97316', border: '1px solid #f97316', borderRadius: 4, padding: '0.1rem 0.4rem' }}>
                      Needs Settle
                    </span>
                  )}
                  {role === 'band_admin' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: 'auto', fontSize: '0.74rem' }}
                      onClick={() => window.location.href = `/bookings/${b.id}`}
                    >
                      {b.status === 'completed' ? 'Edit Post-Gig Data' : 'Settle Show →'}
                    </button>
                  )}
                </div>

                {(b.post_show_notes || b.venue_feedback) && (
                  <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {b.post_show_notes || b.venue_feedback}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Venue Intelligence */}
      {venueIntel.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>
            Venue Intelligence
          </h2>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
            Top-ranked venues by rating and would-return score.
          </p>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Venue</th>
                    <th>Location</th>
                    <th>Shows</th>
                    <th>Avg Pay</th>
                    <th>Rating</th>
                    <th>Would Return</th>
                  </tr>
                </thead>
                <tbody>
                  {venueIntel.map(v => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{v.name}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{v.city}{v.state ? `, ${v.state}` : ''}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{v.shows}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--accent)' }}>
                        {v.avgPay > 0 ? `$${v.avgPay.toLocaleString()}` : '—'}
                      </td>
                      <td><Stars value={v.avgRating > 0 ? Math.round(v.avgRating) : null} /></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: v.returns > 0 ? '#34d399' : 'var(--text-muted)' }}>
                        {v.returns}/{v.shows}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit Post-Gig Modal */}
      {editModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setEditModal(null)}
        >
          <div
            style={{ background: 'var(--surface)', borderRadius: 12, padding: '1.75rem', width: 480, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: '1.25rem' }}>Edit Post-Gig Data</h2>

            <label style={{ display: 'block', marginBottom: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>ACTUAL ATTENDANCE</div>
              <input type="number" className="input" style={{ width: '100%' }} placeholder="0"
                value={editModal.attendance}
                onChange={e => setEditModal(m => m && ({ ...m, attendance: e.target.value }))} />
            </label>

            <label style={{ display: 'block', marginBottom: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>FINAL PAYMENT RECEIVED ($)</div>
              <input type="number" className="input" style={{ width: '100%' }} placeholder="0.00" step="0.01"
                value={editModal.actual_amount_received}
                onChange={e => setEditModal(m => m && ({ ...m, actual_amount_received: e.target.value }))} />
            </label>

            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>PERFORMANCE RATING</div>
              <Stars value={editModal.rating} onChange={n => setEditModal(m => m && ({ ...m, rating: n }))} />
            </div>

            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>WOULD RETURN?</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(['yes', 'no', 'maybe'] as const).map(v => (
                  <button
                    key={v}
                    className={`btn btn-sm ${editModal.rebook_flag === v ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setEditModal(m => m && ({
                      ...m,
                      rebook_flag:  v,
                      would_return: v === 'yes' ? true : v === 'no' ? false : null,
                    }))}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <label style={{ display: 'block', marginBottom: '0.85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>VENUE FEEDBACK</div>
              <textarea className="input" style={{ width: '100%', minHeight: 70, resize: 'vertical' }} placeholder="Notes about venue, staff, etc."
                value={editModal.venue_feedback}
                onChange={e => setEditModal(m => m && ({ ...m, venue_feedback: e.target.value }))} />
            </label>

            <label style={{ display: 'block', marginBottom: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>INTERNAL NOTES</div>
              <textarea className="input" style={{ width: '100%', minHeight: 70, resize: 'vertical' }} placeholder="Internal notes"
                value={editModal.post_show_notes}
                onChange={e => setEditModal(m => m && ({ ...m, post_show_notes: e.target.value }))} />
            </label>

            {saveErr && <div style={{ color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{saveErr}</div>}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={saveEdit}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
