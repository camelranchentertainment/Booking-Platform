'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface BandInfo {
  id: string;
  band_name: string;
  genre: string;
  bio: string;
  epk_link: string;
  instagram: string;
  facebook: string;
  website: string;
  owner_user_id: string;
  agent_user_id: string | null;
}

interface Show {
  id: string;
  date: string;
  venue_name: string;
  venue_city: string;
  venue_state: string;
  campaign_name: string;
}

interface Run {
  id: string;
  name: string;
  status: string;
  date_range_start: string | null;
  date_range_end: string | null;
  bookings: number;
}

interface AgentInfo {
  agency_name: string | null;
  agent_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function MemberView({ userId }: { userId: string }) {
  const [band,         setBand]         = useState<BandInfo | null>(null);
  const [agent,        setAgent]        = useState<AgentInfo | null>(null);
  const [shows,        setShows]        = useState<Show[]>([]);
  const [runs,         setRuns]         = useState<Run[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [calYear,      setCalYear]      = useState(new Date().getFullYear());
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Find this member's band via band_members
      const { data: membership } = await supabase
        .from('band_members')
        .select('band_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (!membership) { setLoading(false); return; }

      const { data: bandData } = await supabase
        .from('bands')
        .select('*')
        .eq('id', membership.band_id)
        .maybeSingle();
      if (!bandData) { setLoading(false); return; }
      setBand(bandData);

      // Agent info
      const agentId = bandData.agent_user_id || bandData.owner_user_id;
      const { data: agentProfile } = await supabase
        .from('profiles')
        .select('agent_name, agency_name, contact_email, contact_phone')
        .eq('id', agentId)
        .maybeSingle();
      setAgent(agentProfile);

      // Confirmed shows
      const { data: showData } = await supabase
        .from('campaign_venues')
        .select(`id, status, booking_date,
          campaign:campaigns(id, name, user_id),
          venue:venues(id, name, city, state)`)
        .eq('status', 'booked')
        .not('booking_date', 'is', null)
        .order('booking_date');

      const filtered = (showData || []).filter((cv: any) => {
        const camp = Array.isArray(cv.campaign) ? cv.campaign[0] : cv.campaign;
        return camp?.user_id === agentId;
      });
      setShows(filtered.map((cv: any) => {
        const venue = Array.isArray(cv.venue) ? cv.venue[0] : cv.venue;
        const camp  = Array.isArray(cv.campaign) ? cv.campaign[0] : cv.campaign;
        return { id: cv.id, date: cv.booking_date, venue_name: venue?.name || 'Unknown', venue_city: venue?.city || '', venue_state: venue?.state || '', campaign_name: camp?.name || '' };
      }));

      // Runs
      const { data: runData } = await supabase
        .from('campaigns')
        .select('id, name, status, date_range_start, date_range_end, bookings')
        .eq('user_id', agentId)
        .in('status', ['active', 'completed'])
        .order('date_range_start', { ascending: false });
      setRuns(runData || []);

    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const showsByDate = shows.reduce<Record<string, Show[]>>((acc, s) => {
    if (!s.date) return acc;
    const key = s.date.slice(0, 10);
    acc[key] = [...(acc[key] || []), s];
    return acc;
  }, {});

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#7aa5c4' }}>Loading…</div>;
  if (!band)   return <div style={{ padding: '3rem', textAlign: 'center', color: '#f87171' }}>You are not linked to a band yet.</div>;

  const yearShows = shows.filter(s => s.date?.startsWith(String(calYear)));

  return (
    <>
      <style>{`
        .mv-day { min-height: 48px; border-radius: 6px; padding: 3px; position: relative; }
        .mv-day.has-show { background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); cursor: pointer; }
        .mv-day.has-show:hover { background: rgba(34,197,94,0.15); }
      `}</style>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem' }}>

        {/* Band header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '2.6rem', letterSpacing: '0.07em', color: '#fff', margin: 0 }}>
            {band.band_name}
          </h1>
          {band.genre && <div style={{ color: '#7aa5c4', fontSize: 14, marginTop: 2 }}>{band.genre}</div>}
          {agent && (
            <div style={{ color: '#4a7a9b', fontSize: 13, marginTop: 6 }}>
              Booking: <span style={{ color: '#7aa5c4' }}>{agent.agency_name || agent.agent_name || 'Your Agent'}</span>
              {agent.contact_email && <span style={{ marginLeft: 10 }}>· {agent.contact_email}</span>}
            </div>
          )}
        </div>

        {/* ── Calendar ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ color: '#e8f1f8', fontWeight: 700, fontSize: '1rem', margin: 0 }}>
              {calYear} · {yearShows.length} confirmed show{yearShows.length !== 1 ? 's' : ''}
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCalYear(y => y - 1)} style={{ padding: '5px 11px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 6, color: '#7aa5c4', cursor: 'pointer' }}>←</button>
              <button onClick={() => setCalYear(y => y + 1)} style={{ padding: '5px 11px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 6, color: '#7aa5c4', cursor: 'pointer' }}>→</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {MONTH_FULL.map((monthName, mIdx) => {
              const firstDay = new Date(calYear, mIdx, 1).getDay();
              const daysInMonth = new Date(calYear, mIdx + 1, 0).getDate();
              const monthShowEntries = Object.entries(showsByDate).filter(([d]) => {
                const dt = new Date(d + 'T00:00:00');
                return dt.getFullYear() === calYear && dt.getMonth() === mIdx;
              });

              return (
                <div key={mIdx} style={{ background: 'rgba(9,24,40,0.6)', border: '1px solid rgba(74,133,200,0.12)', borderRadius: 10, padding: 14 }}>
                  <div style={{ color: '#e8f1f8', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{monthName}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                    {['S','M','T','W','T','F','S'].map((d, i) => (
                      <div key={i} style={{ textAlign: 'center', color: '#3d6285', fontSize: 10, fontWeight: 700, paddingBottom: 3 }}>{d}</div>
                    ))}
                    {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const dateKey = `${calYear}-${String(mIdx+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                      const dayShows = showsByDate[dateKey] || [];
                      return (
                        <div key={day} className={`mv-day${dayShows.length ? ' has-show' : ''}`}
                          onClick={() => dayShows.length && setSelectedShow(dayShows[0])}>
                          <div style={{ fontSize: 11, color: dayShows.length ? '#e8f1f8' : '#4a7a9b', fontWeight: dayShows.length ? 700 : 400, textAlign: 'center' }}>{day}</div>
                          {dayShows.length > 0 && (
                            <div style={{ fontSize: 9, color: '#22c55e', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              ●
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {monthShowEntries.length > 0 && (
                    <div style={{ marginTop: 8, borderTop: '1px solid rgba(74,133,200,0.1)', paddingTop: 7 }}>
                      {monthShowEntries.map(([d, s]) => (
                        <div key={d} onClick={() => setSelectedShow(s[0])}
                          style={{ fontSize: 11, color: '#7aa5c4', padding: '3px 5px', cursor: 'pointer', borderRadius: 4 }}>
                          <span style={{ color: '#22c55e', fontWeight: 700 }}>{new Date(d + 'T00:00:00').getDate()} </span>
                          {s[0].venue_name}, {s[0].venue_city}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Band Profile + Runs ──────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* Band Profile */}
          <div style={{ background: 'rgba(9,24,40,0.6)', border: '1px solid rgba(74,133,200,0.12)', borderRadius: 12, padding: 24 }}>
            <div style={{ color: '#7aa5c4', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid rgba(74,133,200,0.15)', paddingBottom: 8, marginBottom: 16 }}>Band Profile</div>
            {band.bio && <p style={{ color: '#e8f1f8', fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>{band.bio}</p>}
            {band.epk_link && (
              <a href={band.epk_link} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-block', padding: '8px 16px', background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', marginBottom: 16 }}>
                View EPK
              </a>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {band.instagram && <a href={band.instagram.startsWith('http') ? band.instagram : `https://instagram.com/${band.instagram.replace('@','')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#7aa5c4', fontSize: 13, textDecoration: 'none' }}>Instagram</a>}
              {band.facebook  && <a href={band.facebook.startsWith('http')  ? band.facebook  : `https://${band.facebook}`}  target="_blank" rel="noopener noreferrer" style={{ color: '#7aa5c4', fontSize: 13, textDecoration: 'none' }}>Facebook</a>}
              {band.website   && <a href={band.website}   target="_blank" rel="noopener noreferrer" style={{ color: '#7aa5c4', fontSize: 13, textDecoration: 'none' }}>Website</a>}
            </div>
          </div>

          {/* Active Runs */}
          <div style={{ background: 'rgba(9,24,40,0.6)', border: '1px solid rgba(74,133,200,0.12)', borderRadius: 12, padding: 24 }}>
            <div style={{ color: '#7aa5c4', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid rgba(74,133,200,0.15)', paddingBottom: 8, marginBottom: 16 }}>Runs & Tours</div>
            {runs.length === 0 ? (
              <div style={{ color: '#4a7a9b', fontSize: 13 }}>No active runs yet.</div>
            ) : runs.map(r => (
              <div key={r.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(74,133,200,0.08)' }}>
                <div style={{ color: '#e8f1f8', fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                {(r.date_range_start || r.date_range_end) && (
                  <div style={{ color: '#7aa5c4', fontSize: 12, marginTop: 2 }}>
                    {r.date_range_start ? new Date(r.date_range_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                    {r.date_range_end ? ` – ${new Date(r.date_range_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center' }}>
                  <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 700 }}>{r.bookings || 0} confirmed</span>
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    background: r.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(74,133,200,0.1)',
                    color: r.status === 'active' ? '#22c55e' : '#7aa5c4',
                    border: `1px solid ${r.status === 'active' ? 'rgba(34,197,94,0.3)' : 'rgba(74,133,200,0.2)'}`,
                  }}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Show detail modal */}
      {selectedShow && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} onClick={() => setSelectedShow(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 51, background: '#091828', border: '1px solid rgba(74,133,200,0.3)', borderRadius: 14, padding: '28px 32px', width: 'min(420px, 92vw)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Confirmed Show</div>
              <button onClick={() => setSelectedShow(null)} style={{ background: 'none', border: 'none', color: '#4a7a9b', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ color: '#fff', fontFamily: "'Bebas Neue', cursive", fontSize: '1.8rem', letterSpacing: '0.05em', marginBottom: 4 }}>{selectedShow.venue_name}</div>
            <div style={{ color: '#7aa5c4', fontSize: 14, marginBottom: 20 }}>{selectedShow.venue_city}{selectedShow.venue_state ? `, ${selectedShow.venue_state}` : ''}</div>
            <div>
              <div style={{ color: '#4a7a9b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Date</div>
              <div style={{ color: '#e8f1f8', fontSize: 14 }}>{new Date(selectedShow.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
            </div>
            {selectedShow.campaign_name && (
              <div style={{ marginTop: 16 }}>
                <div style={{ color: '#4a7a9b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Run</div>
                <div style={{ color: '#e8f1f8', fontSize: 14 }}>{selectedShow.campaign_name}</div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
