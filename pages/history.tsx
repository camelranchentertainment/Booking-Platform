import { useState, useEffect, useMemo } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { getAgentActIds, getAgentActs } from '../lib/bookingQueries';
import Link from 'next/link';

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
const REBOOK_COLORS: Record<string, string> = {
  yes:   '#34d399',
  no:    '#f87171',
  maybe: '#fbbf24',
};

function toCSV(rows: any[]): string {
  if (!rows.length) return '';
  const headers = ['Date', 'Venue', 'City', 'Band', 'Deal Type', 'Agreed', 'Received', 'Payment Status', 'Re-book', 'Notes'];
  const lines = rows.map(r => [
    r.show_date || '',
    r.venue?.name || '',
    r.venue?.city || '',
    r.act?.act_name || '',
    DEAL_LABELS[r.deal_type] || r.deal_type || '',
    r.agreed_amount ?? '',
    r.actual_amount_received ?? '',
    r.payment_status || '',
    r.rebook_flag || '',
    (r.post_show_notes || '').replace(/,/g, ';'),
  ]);
  return [headers, ...lines].map(row => row.join(',')).join('\n');
}

export default function HistoryPage() {
  const [bookings, setBookings]     = useState<any[]>([]);
  const [acts, setActs]             = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterAct, setFilterAct]       = useState('');
  const [filterVenue, setFilterVenue]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom]     = useState('');
  const [filterTo, setFilterTo]         = useState('');
  const [sortBy, setSortBy]         = useState<'date' | 'amount'>('date');
  const [expanded, setExpanded]     = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const agentActIds = await getAgentActIds(supabase, user.id);

    let q = supabase.from('bookings').select(`
      id, show_date, deal_type, agreed_amount, actual_amount_received,
      payment_status, rebook_flag, post_show_notes,
      act:acts(id, act_name),
      venue:venues(name, city, state)
    `).eq('status', 'completed').order('show_date', { ascending: false });

    if (agentActIds.length > 0) {
      q = q.or(`act_id.in.(${agentActIds.join(',')}),created_by.eq.${user.id}`);
    } else {
      q = q.eq('created_by', user.id);
    }

    const [bookingsRes, allActs] = await Promise.all([
      q,
      getAgentActs(supabase, user.id),
    ]);
    setBookings(bookingsRes.data || []);
    setActs(allActs);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let list = bookings;
    if (filterAct) list = list.filter(b => b.act?.id === filterAct);
    if (filterVenue) list = list.filter(b => b.venue?.name?.toLowerCase().includes(filterVenue.toLowerCase()));
    if (filterStatus) list = list.filter(b => b.payment_status === filterStatus);
    if (filterFrom) list = list.filter(b => b.show_date >= filterFrom);
    if (filterTo) list = list.filter(b => b.show_date <= filterTo);
    if (sortBy === 'amount') list = [...list].sort((a, b) => (Number(b.agreed_amount) || 0) - (Number(a.agreed_amount) || 0));
    return list;
  }, [bookings, filterAct, filterVenue, filterStatus, filterFrom, filterTo, sortBy]);

  const totalExpected  = filtered.reduce((s, b) => s + (Number(b.agreed_amount) || 0), 0);
  const totalReceived  = filtered.reduce((s, b) => s + (Number(b.actual_amount_received) || 0), 0);
  const totalOutstanding = totalExpected - totalReceived;

  const exportCSV = () => {
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'show-history.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Show History</h1>
          <div className="page-sub">{filtered.length} completed show{filtered.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exportCSV}>↓ Export CSV</button>
      </div>

      {/* Filters */}
      <div className="card mb-6" style={{ padding: '0.85rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, minWidth: 160 }}>
            <label className="field-label">Band</label>
            <select className="select" value={filterAct} onChange={e => setFilterAct(e.target.value)}>
              <option value="">All Bands</option>
              {acts.map(a => <option key={a.id} value={a.id}>{a.act_name}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 150 }}>
            <label className="field-label">Venue</label>
            <input className="input" placeholder="Search venue..." value={filterVenue} onChange={e => setFilterVenue(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0, minWidth: 140 }}>
            <label className="field-label">Payment Status</label>
            <select className="select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="received">Received</option>
              <option value="waived">Waived</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-label">From</label>
            <input className="input" type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="field-label">To</label>
            <input className="input" type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0, minWidth: 120 }}>
            <label className="field-label">Sort By</label>
            <select className="select" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="date">Date</option>
              <option value="amount">Amount</option>
            </select>
          </div>
          {(filterAct || filterVenue || filterStatus || filterFrom || filterTo) && (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => { setFilterAct(''); setFilterVenue(''); setFilterStatus(''); setFilterFrom(''); setFilterTo(''); }}>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid-4 mb-6">
        {[
          ['Shows', filtered.length],
          ['Total Expected', totalExpected > 0 ? `$${totalExpected.toLocaleString()}` : '—'],
          ['Total Received', totalReceived > 0 ? `$${totalReceived.toLocaleString()}` : '—'],
          ['Outstanding', totalOutstanding > 0 ? `$${totalOutstanding.toLocaleString()}` : '—'],
        ].map(([label, val]) => (
          <div key={label} className="stat-block">
            <div className="stat-value" style={{ fontSize: '1.3rem' }}>{val}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 56 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
          No completed shows match your filters.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Venue</th>
                  <th>Band</th>
                  <th>Deal</th>
                  <th>Agreed</th>
                  <th>Received</th>
                  <th>Payment</th>
                  <th>Re-book</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <>
                    <tr
                      key={b.id}
                      style={{ cursor: b.post_show_notes ? 'pointer' : 'default' }}
                      onClick={() => b.post_show_notes && setExpanded(expanded === b.id ? null : b.id)}
                    >
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {b.show_date ? new Date(b.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td>
                        <Link href={`/venues/${b.venue?.id}`} style={{ color: 'var(--text-primary)', fontWeight: 500, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                          {b.venue?.name || '—'}
                        </Link>
                        {b.venue?.city && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{b.venue.city}, {b.venue.state}</div>}
                      </td>
                      <td style={{ color: 'var(--accent)', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>{b.act?.act_name || '—'}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{DEAL_LABELS[b.deal_type] || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                        {b.agreed_amount ? `$${Number(b.agreed_amount).toLocaleString()}` : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: b.actual_amount_received ? '#34d399' : 'var(--text-muted)' }}>
                        {b.actual_amount_received ? `$${Number(b.actual_amount_received).toLocaleString()}` : '—'}
                      </td>
                      <td>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase',
                          letterSpacing: '0.08em', color: PAY_COLORS[b.payment_status] || 'var(--text-muted)',
                        }}>
                          {b.payment_status || '—'}
                        </span>
                      </td>
                      <td>
                        {b.rebook_flag ? (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: REBOOK_COLORS[b.rebook_flag] }}>
                            {b.rebook_flag}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                    {expanded === b.id && b.post_show_notes && (
                      <tr key={`${b.id}-notes`}>
                        <td colSpan={8} style={{ background: 'var(--bg-overlay)', fontSize: '0.82rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', padding: '0.6rem 1rem', lineHeight: 1.6 }}>
                          {b.post_show_notes}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
