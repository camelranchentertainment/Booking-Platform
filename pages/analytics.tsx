import { useEffect, useState } from 'react';
import AppShell from '../components/layout/AppShell';
import { useAuth } from '../contexts/AuthContext';
import { useRequireAuth } from '../lib/hooks/useRequireAuth';
import { supabase } from '../lib/supabase';

type SortKey = 'state' | 'total' | 'waiting' | 'confirmed' | 'conversionRate' | 'responseRate';

const STAGE_ORDER = ['target', 'pitched', 'waiting', 'follow_up', 'confirmed'] as const;
const STAGE_LABELS: Record<string, string> = {
  target:    'Target',
  pitched:   'Pitched',
  waiting:   'Waiting on Response',
  follow_up: 'Follow Up',
  confirmed: 'Confirmed',
};

const DEAL_LABELS: Record<string, string> = {
  guarantee:   'Guarantee',
  door_split:  'Door Split',
  percentage:  'Percentage',
  flat_fee:    'Flat Fee',
  other:       'Other',
  unspecified: 'Unspecified',
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      padding: '1.1rem 1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.3rem',
    }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      padding: '2rem',
      textAlign: 'center',
      fontFamily: 'var(--font-body)',
      fontSize: '0.85rem',
      color: 'var(--text-muted)',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8,
    }}>
      {message}
    </div>
  );
}

export default function AnalyticsPage() {
  const { profile, loading: authLoading } = useRequireAuth('band_admin');

  const [data, setData]               = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [actName, setActName]         = useState<string>('');
  const [sortKey, setSortKey]         = useState<SortKey>('confirmed');
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc');
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [recsLoaded, setRecsLoaded]   = useState(false);

  useEffect(() => {
    if (!profile || authLoading) return;
    loadAnalytics();
    loadActName();
  }, [profile, authLoading]);

  const loadActName = async () => {
    if (!profile?.act_id) return;
    const { data: act } = await supabase.from('acts').select('act_name').eq('id', profile.act_id).maybeSingle();
    if (act?.act_name) setActName(act.act_name);
  };

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    const timeout = setTimeout(() => setLoading(false), 5000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/analytics', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!response.ok) throw new Error('Failed to load analytics');
      setData(await response.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const loadRecommendations = async () => {
    if (!data || recsLoaded) return;
    setLoadingRecs(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/analytics/recommendations', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ analyticsData: data, actName }),
      });
      const json = await response.json();
      setRecommendations(json.recommendations ?? []);
      setRecsLoaded(true);
    } catch (e) {
      console.error('Recommendations error:', e);
    } finally {
      setLoadingRecs(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sectionLabel: React.CSSProperties = {
    fontFamily:    'var(--font-display)',
    fontSize:      '1.1rem',
    color:         'var(--text-primary)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom:  '0.75rem',
  };

  const card: React.CSSProperties = {
    background:   'rgba(255,255,255,0.04)',
    border:       '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding:      '1.25rem',
  };

  const cardTitle: React.CSSProperties = {
    fontFamily:    'var(--font-display)',
    fontSize:      '0.78rem',
    color:         'var(--text-muted)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom:  '1rem',
  };

  if (authLoading || loading) {
    return (
      <AppShell requireRole="band_admin">
        <div style={{ padding: '2rem', fontFamily: 'var(--font-body)', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          Loading analytics…
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell requireRole="band_admin">
        <div style={{ padding: '2rem', fontFamily: 'var(--font-body)', color: '#f87171', fontSize: '0.88rem' }}>
          {error}
        </div>
      </AppShell>
    );
  }

  const pipeline          = data?.pipeline         ?? {};
  const regional          = data?.regionalPerformance ?? [];
  const emailPerf         = data?.emailPerformance  ?? {};
  const financials        = data?.bookingFinancials ?? {};
  const tourStats         = data?.tourStats         ?? [];
  const conversionRate    = data?.conversionRate    ?? 0;
  const responseRate      = data?.responseRate      ?? 0;

  const sortedRegional = [...regional].sort((a: any, b: any) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const maxConfirmed = Math.max(...regional.map((r: any) => r.confirmed), 1);

  const thStyle: React.CSSProperties = {
    fontFamily:    'var(--font-body)',
    fontSize:      '0.72rem',
    color:         'var(--text-muted)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding:       '0.5rem 0.75rem',
    textAlign:     'left',
    borderBottom:  '1px solid rgba(255,255,255,0.08)',
    cursor:        'pointer',
    whiteSpace:    'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize:   '0.85rem',
    color:      'var(--text-secondary)',
    padding:    '0.6rem 0.75rem',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  };

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <AppShell requireRole="band_admin">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1rem 3rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

        {/* Page header */}
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--text-primary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Analytics
          </div>
          {actName && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {actName}
            </div>
          )}
        </div>

        {/* ── Section 1: Summary Bar ── */}
        <div>
          <div style={sectionLabel}>Overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <StatCard
              label="Total in Pipeline"
              value={pipeline.total ?? 0}
              sub="across all tours"
            />
            <StatCard
              label="Conversion Rate"
              value={`${conversionRate}%`}
              sub="target → confirmed"
            />
            <StatCard
              label="Response Rate"
              value={`${responseRate}%`}
              sub="reached out → replied"
            />
            <StatCard
              label="Confirmed Shows"
              value={financials.futureConfirmedCount ?? 0}
              sub="upcoming booked shows"
            />
            <StatCard
              label="Shows Performed"
              value={financials.totalCompleted ?? 0}
              sub="completed shows"
            />
          </div>
        </div>

        {/* ── Section 2: Pipeline Funnel ── */}
        <div>
          <div style={sectionLabel}>Pipeline Funnel</div>
          {pipeline.total === 0 ? (
            <EmptyState message="No venues in pipeline yet — add venues to a tour to start tracking your outreach funnel." />
          ) : (
            <div style={card}>
              <div style={cardTitle}>Outreach Stages</div>

              {/* Main funnel stages */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {STAGE_ORDER.map((stage, i) => {
                  const count    = pipeline[stage] ?? 0;
                  const pct      = pipeline.total > 0 ? Math.round((count / pipeline.total) * 100) : 0;
                  const isLast   = i === STAGE_ORDER.length - 1;
                  const nextCount = !isLast ? (pipeline[STAGE_ORDER[i + 1]] ?? 0) : 0;
                  const dropOff  = !isLast && count > 0 ? Math.round(((count - nextCount) / count) * 100) : null;

                  return (
                    <div key={stage} style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{
                        background:   stage === 'confirmed' ? 'rgba(232,96,42,0.15)' : 'rgba(107,143,181,0.12)',
                        border:       `1px solid ${stage === 'confirmed' ? 'rgba(232,96,42,0.5)' : 'rgba(107,143,181,0.3)'}`,
                        borderRadius: 6,
                        padding:      '0.75rem 1rem',
                        textAlign:    'center',
                        minWidth:     90,
                      }}>
                        <div style={{
                          fontFamily: 'var(--font-display)',
                          fontSize:   '1.6rem',
                          color:      stage === 'confirmed' ? '#E8602A' : '#6B8FB5',
                          lineHeight: 1,
                        }}>
                          {count}
                        </div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem', letterSpacing: '0.06em' }}>
                          {STAGE_LABELS[stage]}
                        </div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: stage === 'confirmed' ? '#E8602A' : 'var(--text-muted)', marginTop: '0.15rem' }}>
                          {pct}%
                        </div>
                      </div>

                      {!isLast && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 0.4rem' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>→</span>
                          {dropOff !== null && (
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: '#f87171', whiteSpace: 'nowrap' }}>
                              -{dropOff}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Declined pill */}
              {pipeline.declined > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Also:</span>
                  <span style={{
                    background: 'rgba(112,128,144,0.15)',
                    border:     '1px solid rgba(112,128,144,0.3)',
                    borderRadius: 99,
                    padding:    '0.2rem 0.65rem',
                    fontFamily: 'var(--font-body)',
                    fontSize:   '0.78rem',
                    color:      '#708090',
                  }}>
                    {pipeline.declined} Declined
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Section 3: Regional Performance ── */}
        <div>
          <div style={sectionLabel}>Regional Performance</div>
          {regional.length === 0 ? (
            <EmptyState message="No regional data yet — venue city/state data will appear here as your pipeline grows." />
          ) : (
            <div style={card}>
              <div style={cardTitle}>By State</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {([
                        ['state',          'State'],
                        ['total',          'Total'],
                        ['responseRate',   'Response Rate'],
                        ['confirmed',      'Confirmed'],
                        ['conversionRate', 'Conversion'],
                      ] as [SortKey, string][]).map(([key, label]) => (
                        <th key={key} style={thStyle} onClick={() => handleSort(key)}>
                          {label}{sortArrow(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRegional.map((r: any) => (
                      <tr key={r.state}>
                        <td style={{ ...tdStyle, color: 'var(--text-primary)', fontWeight: 600 }}>{r.state}</td>
                        <td style={tdStyle}>{r.total}</td>
                        <td style={tdStyle}>{r.responseRate}%</td>
                        <td style={{ ...tdStyle, color: r.confirmed > 0 ? '#E8602A' : 'var(--text-muted)' }}>{r.confirmed}</td>
                        <td style={tdStyle}>{r.conversionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* CSS bar chart — sorted by confirmed desc */}
              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Confirmed by State
                </div>
                {[...regional]
                  .sort((a: any, b: any) => b.confirmed - a.confirmed)
                  .filter((r: any) => r.confirmed > 0)
                  .map((r: any) => (
                    <div key={r.state} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: 32, fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
                        {r.state}
                      </div>
                      <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 3, height: 18, overflow: 'hidden' }}>
                        <div style={{
                          width:      `${Math.round((r.confirmed / maxConfirmed) * 100)}%`,
                          height:     '100%',
                          background: '#E8602A',
                          borderRadius: 3,
                          minWidth:   4,
                        }} />
                      </div>
                      <div style={{ width: 24, fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: '#E8602A', flexShrink: 0 }}>
                        {r.confirmed}
                      </div>
                    </div>
                  ))}
                {regional.every((r: any) => r.confirmed === 0) && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    No confirmed shows yet in any region.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Section 4: Email & Booking Performance ── */}
        <div>
          <div style={sectionLabel}>Performance</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>

            {/* Email Performance */}
            <div style={card}>
              <div style={cardTitle}>Email Activity</div>
              {emailPerf.sent === 0 ? (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                  No emails sent yet. Start a campaign to track outreach activity.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {[
                    ['Emails Sent',    emailPerf.sent],
                    ['Delivery Rate',  `${emailPerf.deliveryRate}%`],
                    ['Response Rate',  `${emailPerf.responseRate}%`],
                  ].map(([label, val]) => (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--text-primary)' }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Booking Financials */}
            <div style={card}>
              <div style={cardTitle}>Booking Financials</div>
              {financials.totalConfirmed === 0 ? (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                  No confirmed shows yet — start a campaign to begin tracking conversions.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {[
                    ['Confirmed Shows',  financials.totalConfirmed],
                    ['Completed Shows',  financials.totalCompleted],
                    ['Total Earned',     financials.totalEarned > 0 ? `$${financials.totalEarned.toLocaleString()}` : '—'],
                    ['Potential (future)', financials.totalPotential > 0 ? `$${financials.totalPotential.toLocaleString()}` : '—'],
                    ['Avg Pay / Show',   financials.avgPay > 0 ? `$${financials.avgPay.toLocaleString()}` : '—'],
                    ...(financials.wouldReturnPct !== null ? [['Would Rebook', `${financials.wouldReturnPct}%`]] : []),
                  ].map(([label, val]) => (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--text-primary)' }}>{val}</span>
                    </div>
                  ))}

                  {/* Deal type breakdown */}
                  {Object.keys(financials.dealTypeBreakdown ?? {}).length > 0 && (
                    <div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                        Deal Types
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {Object.entries(financials.dealTypeBreakdown).map(([type, count]: [string, any]) => (
                          <span key={type} style={{
                            fontFamily:   'var(--font-body)',
                            fontSize:     '0.72rem',
                            color:        '#6B8FB5',
                            background:   'rgba(107,143,181,0.12)',
                            border:       '1px solid rgba(107,143,181,0.25)',
                            borderRadius: 99,
                            padding:      '0.15rem 0.5rem',
                          }}>
                            {DEAL_LABELS[type] ?? type} ({count})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 5: Tour Comparison ── */}
        <div>
          <div style={sectionLabel}>Tour Comparison</div>
          {tourStats.length === 0 ? (
            <EmptyState message="No tours yet — create a tour and add venues to start tracking campaign performance." />
          ) : (
            <div style={card}>
              <div style={cardTitle}>All Tours</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Tour', 'Status', 'Total Venues', 'Contacted', 'Confirmed', 'Conversion'].map(h => (
                        <th key={h} style={{ ...thStyle, cursor: 'default' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tourStats.map((t: any) => (
                      <tr key={t.id}>
                        <td style={{ ...tdStyle, color: 'var(--text-primary)', fontWeight: 600 }}>{t.name || 'Unnamed Tour'}</td>
                        <td style={tdStyle}>
                          <span style={{
                            fontFamily:   'var(--font-body)',
                            fontSize:     '0.7rem',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color:        t.status === 'active' ? '#4caf50' : 'var(--text-muted)',
                          }}>
                            {t.status}
                          </span>
                        </td>
                        <td style={tdStyle}>{t.total}</td>
                        <td style={tdStyle}>{t.contacted}</td>
                        <td style={{ ...tdStyle, color: t.confirmed > 0 ? '#E8602A' : 'var(--text-muted)' }}>{t.confirmed}</td>
                        <td style={tdStyle}>{t.conversionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Section 6: AI Recommendations ── */}
        <div>
          <div style={sectionLabel}>AI Recommendations</div>
          <div style={card}>
            <div style={cardTitle}>Booking Strategy</div>

            {!recsLoaded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Get data-driven recommendations based on your pipeline, regional performance, and booking patterns.
                </div>
                <button
                  className="btn btn-primary"
                  onClick={loadRecommendations}
                  disabled={loadingRecs || !data}
                  style={{ minWidth: 180 }}
                >
                  {loadingRecs ? 'Generating…' : 'Get AI Recommendations'}
                </button>
              </div>
            )}

            {loadingRecs && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>
                Analyzing your data…
              </div>
            )}

            {recsLoaded && recommendations.length === 0 && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                Not enough data to generate recommendations yet. Add more venues and send more outreach to build a pattern.
              </div>
            )}

            {recommendations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {recommendations.map((rec: any, i: number) => (
                  <div key={i} style={{
                    background:   'rgba(232,96,42,0.06)',
                    border:       '1px solid rgba(232,96,42,0.2)',
                    borderRadius: 6,
                    padding:      '0.9rem 1rem',
                  }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: '#E8602A', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                      {rec.title}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', lineHeight: 1.6 }}>
                      {rec.insight}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                      <strong style={{ color: 'var(--text-muted)', fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Action: </strong>
                      {rec.action}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </AppShell>
  );
}
