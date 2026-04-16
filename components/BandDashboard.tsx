'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import VenueSearch from './VenueSearch';
import CampaignManager from './CampaignManager';
import EmailTemplateManager from './EmailTemplateManager';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BandProfile {
  id: string;
  band_name: string;
  genre: string;
  home_city: string;
  home_state: string;
  bio: string;
  epk_link: string;
  instagram: string;
  facebook: string;
  website: string;
  contact_email: string;
  contact_phone: string;
  owner_user_id: string;
  agent_user_id: string | null;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  profile: { display_name: string | null; contact_email: string | null } | null;
  email: string;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

interface Show {
  id: string;
  date: string;
  venue_name: string;
  venue_city: string;
  venue_state: string;
  campaign_name: string;
  status: string;
  source: 'agent' | 'band';
}

interface OutreachEntry {
  id: string;
  venue_name: string;
  venue_city: string;
  venue_state: string;
  sent_at: string;
  subject: string;
  days_ago: number;
}

interface Run {
  id: string;
  name: string;
  status: string;
  date_range_start: string | null;
  date_range_end: string | null;
  bookings: number;
  total_venues: number;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
  label: { display: 'block' as const, color: '#7aa5c4', fontSize: 11, fontWeight: 700 as const, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 5 },
  input: { width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 7, color: '#e8f1f8', fontSize: 13, boxSizing: 'border-box' as const },
  textarea: { width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 7, color: '#e8f1f8', fontSize: 13, resize: 'vertical' as const, lineHeight: 1.6, boxSizing: 'border-box' as const },
  field: { marginBottom: 14 },
  sectionHead: { color: '#e8f1f8', fontWeight: 700 as const, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' as const, borderBottom: '1px solid rgba(74,133,200,0.15)', paddingBottom: 8, marginBottom: 16, marginTop: 28 },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function BandDashboard({ userId }: { userId: string }) {
  const [band,         setBand]         = useState<BandProfile | null>(null);
  const [members,      setMembers]      = useState<Member[]>([]);
  const [invites,      setInvites]      = useState<PendingInvite[]>([]);
  const [shows,        setShows]        = useState<Show[]>([]);
  const [runs,         setRuns]         = useState<Run[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [newBandName,  setNewBandName]  = useState('');
  const [creating,     setCreating]     = useState(false);
  const [createErr,    setCreateErr]    = useState('');
  const [saveMsg,      setSaveMsg]      = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteEmail,  setInviteEmail]  = useState('');
  const [inviting,     setInviting]     = useState(false);
  const [inviteMsg,    setInviteMsg]    = useState<{ ok: boolean; text: string } | null>(null);
  const [activeTab,    setActiveTab]    = useState<'calendar' | 'venues' | 'campaigns' | 'email' | 'settings'>('calendar');
  const [calYear,      setCalYear]      = useState(new Date().getFullYear());
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [outreach,     setOutreach]     = useState<OutreachEntry[]>([]);
  // Add-show form
  const [showForm,     setShowForm]     = useState(false);
  const [newShow,      setNewShow]      = useState({ date: '', venue_name: '', notes: '' });
  const [addingShow,   setAddingShow]   = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch band via server endpoint (service role — bypasses RLS completely)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const bandRes = await fetch('/api/band/me', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const bandJson = await bandRes.json();
      const bandData = bandJson.band;
      if (!bandData) { setLoading(false); return; }
      setBand(bandData);

      // Members
      const { data: memberData } = await supabase
        .from('band_members')
        .select('id, user_id, role')
        .eq('band_id', bandData.id);
      // Fetch display names separately (profiles may not exist for all members)
      const memberList: Member[] = [];
      for (const m of (memberData || [])) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name, contact_email')
          .eq('id', m.user_id)
          .maybeSingle();
        const { data: au } = await supabase.auth.getUser();
        memberList.push({ ...m, profile: prof ?? null, email: '' });
      }
      setMembers(memberList);

      // Pending invites
      const { data: inviteData } = await supabase
        .from('band_invites')
        .select('id, email, role, status, created_at')
        .eq('band_id', bandData.id)
        .eq('status', 'pending');
      setInvites(inviteData || []);

      // Shows — use owner_user_id as the "agent" for now
      const agentId = bandData.agent_user_id || bandData.owner_user_id;
      const { data: showData } = await supabase
        .from('campaign_venues')
        .select(`id, status, booking_date,
          campaign:campaigns(id, name, user_id),
          venue:venues(id, name, city, state)`)
        .eq('status', 'booked')
        .not('booking_date', 'is', null)
        .order('booking_date');

      const agentShows = (showData || [])
        .filter((cv: any) => {
          const camp = Array.isArray(cv.campaign) ? cv.campaign[0] : cv.campaign;
          return camp?.user_id === agentId;
        })
        .map((cv: any) => {
          const venue = Array.isArray(cv.venue) ? cv.venue[0] : cv.venue;
          const camp  = Array.isArray(cv.campaign) ? cv.campaign[0] : cv.campaign;
          return { id: cv.id, date: cv.booking_date, venue_name: venue?.name || 'Unknown', venue_city: venue?.city || '', venue_state: venue?.state || '', campaign_name: camp?.name || '', status: cv.status, source: 'agent' as const };
        });

      // Band's own shows (from band_shows table)
      const { data: bandShowData } = await supabase
        .from('band_shows')
        .select('id, show_date, venue_name, notes, status')
        .eq('band_id', bandData.id)
        .order('show_date');
      const bandShows = (bandShowData || []).map((s: any) => ({
        id: s.id, date: s.show_date, venue_name: s.venue_name || 'TBD',
        venue_city: '', venue_state: '', campaign_name: s.notes || '',
        status: s.status, source: 'band' as const,
      }));

      setShows([...agentShows, ...bandShows].sort((a, b) => a.date?.localeCompare(b.date || '') || 0));

      // Runs
      const { data: runData } = await supabase
        .from('campaigns')
        .select('id, name, status, date_range_start, date_range_end, bookings, total_venues')
        .eq('user_id', agentId)
        .in('status', ['active', 'completed'])
        .order('date_range_start', { ascending: false });
      setRuns(runData || []);

      // 30-day outreach log — emails agent sent on behalf of this band
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: outreachData } = await supabase
        .from('email_logs')
        .select('id, sent_at, subject, venue:venues(name, city, state)')
        .eq('band_id', bandData.id)
        .gte('sent_at', since)
        .order('sent_at', { ascending: false });
      const now = Date.now();
      setOutreach((outreachData || []).map((e: any) => {
        const v = Array.isArray(e.venue) ? e.venue[0] : e.venue;
        return {
          id: e.id, sent_at: e.sent_at, subject: e.subject,
          venue_name: v?.name || '—', venue_city: v?.city || '', venue_state: v?.state || '',
          days_ago: Math.floor((now - new Date(e.sent_at).getTime()) / 86400000),
        };
      }));

    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // ── Save profile ──────────────────────────────────────────────────────────
  const save = async () => {
    if (!band) return;
    setSaving(true); setSaveMsg(null);
    const { error } = await supabase.from('bands').update({
      band_name: band.band_name, genre: band.genre, bio: band.bio,
      home_city: band.home_city, home_state: band.home_state,
      epk_link: band.epk_link, instagram: band.instagram,
      facebook: band.facebook, website: band.website,
      contact_email: band.contact_email, contact_phone: band.contact_phone,
    }).eq('id', band.id);
    setSaving(false);
    if (error) setSaveMsg({ ok: false, text: `✗ ${error.message}` });
    else       setSaveMsg({ ok: true,  text: '✓ Profile saved.' });
  };

  // ── Invite member ─────────────────────────────────────────────────────────
  const sendInvite = async () => {
    if (!band || !inviteEmail.trim()) return;
    setInviting(true); setInviteMsg(null);
    try {
      const { data: { session: invSess } } = await supabase.auth.getSession();
      const res = await fetch('/api/band/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${invSess?.access_token ?? ''}`,
        },
        body: JSON.stringify({ bandId: band.id, email: inviteEmail.trim(), role: 'member' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      setInviteMsg({ ok: true, text: `✓ Invite sent to ${inviteEmail.trim()}` });
      setInviteEmail('');
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setInviteMsg({ ok: false, text: `✗ ${msg}` });
    } finally { setInviting(false); }
  };

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const showsByDate = shows.reduce<Record<string, Show[]>>((acc, s) => {
    if (!s.date) return acc;
    const key = s.date.slice(0, 10);
    acc[key] = [...(acc[key] || []), s];
    return acc;
  }, {});

  const createBand = async () => {
    if (!newBandName.trim()) return;
    setCreating(true); setCreateErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setCreateErr('Session expired — please sign in again.');
        setCreating(false);
        return;
      }
      const res = await fetch('/api/band/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bandName: newBandName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Show a full-page style error so it can't be missed
        setCreateErr(data.error || 'Server error — check your connection and try again');
        setCreating(false);
        return;
      }
      // Use the band returned by the API directly — never depends on client-side RLS
      if (data.band) {
        setBand(data.band);
        setCreating(false);
        return;
      }
      // Fallback: re-fetch via load()
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Network error — check your connection';
      setCreateErr(msg);
    }
    setCreating(false);
  };

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#7aa5c4' }}>Loading…</div>;

  if (!band) return (
    <div style={{ maxWidth: 420, margin: '6rem auto', padding: '2rem', background: 'rgba(9,24,40,0.9)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 14 }}>
      <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: '1.6rem', color: '#fff', letterSpacing: '0.06em', marginBottom: 6 }}>Set Up Your Band</div>
      <p style={{ color: '#7aa5c4', fontSize: 13, marginBottom: 20 }}>Enter your band name to finish setting up your dashboard.</p>
      <input
        style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(74,133,200,0.25)', borderRadius: 8, color: '#e8f1f8', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' as const }}
        placeholder="Jake Stringer & Better Than Nothin'"
        value={newBandName}
        onChange={e => setNewBandName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && createBand()}
      />
      {createErr && (
        <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: '#f87171', fontSize: 13, fontWeight: 600 }}>
          {createErr}
        </div>
      )}
      <button onClick={createBand} disabled={creating || !newBandName.trim()}
        style={{ width: '100%', padding: '11px', background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: creating || !newBandName.trim() ? 0.6 : 1 }}>
        {creating ? 'Creating…' : 'Create Band'}
      </button>
    </div>
  );

  const tabs = [
    { id: 'calendar',  label: 'Calendar' },
    { id: 'venues',    label: 'Venues' },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'email',     label: 'Email' },
    { id: 'settings',  label: 'Settings' },
  ] as const;

  return (
    <>
      <style>{`
        .bd-input:focus { border-color:rgba(74,133,200,0.5)!important; outline:none; box-shadow:0 0 0 3px rgba(74,133,200,0.08); }
        .bd-tab { padding:10px 18px; background:rgba(255,255,255,0.04); border:1px solid rgba(74,133,200,0.1); border-radius:8px; color:rgba(255,255,255,0.55); font-size:13px; font-weight:700; cursor:pointer; transition:all .15s; white-space:nowrap; }
        .bd-tab:hover { background:rgba(74,133,200,0.1); color:#fff; }
        .bd-tab.active { background:rgba(58,127,193,0.2); color:#fff; border-color:rgba(74,133,200,0.5); }
        .cal-day { min-height:56px; border-radius:6px; padding:4px; cursor:pointer; transition:background .12s; position:relative; }
        .cal-day:hover { background:rgba(74,133,200,0.08); }
        .cal-day.has-show { background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.2); }
        .cal-day.has-show:hover { background:rgba(34,197,94,0.15); }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem' }}>

        {/* Header */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: '2.4rem', letterSpacing: '0.07em', color: '#fff', margin: 0 }}>
              {band.band_name}
            </h1>
            {band.genre && <div style={{ color: '#7aa5c4', fontSize: 14, marginTop: 2 }}>{band.genre}</div>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 28 }}>
          {tabs.map(t => (
            <button key={t.id} className={`bd-tab${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* ── Calendar ────────────────────────────────────────────────────── */}
        {activeTab === 'calendar' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{ color: '#e8f1f8', fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>
                {calYear} · {shows.filter(s => s.date?.startsWith(String(calYear))).length} show{shows.filter(s => s.date?.startsWith(String(calYear))).length !== 1 ? 's' : ''}
              </h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setCalYear(y => y - 1)} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 6, color: '#7aa5c4', cursor: 'pointer' }}>←</button>
                <button onClick={() => setCalYear(y => y + 1)} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 6, color: '#7aa5c4', cursor: 'pointer' }}>→</button>
                <button onClick={() => setShowForm(f => !f)}
                  style={{ padding: '6px 16px', background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  + Add Show
                </button>
              </div>
            </div>

            {/* Add Show form */}
            {showForm && (
              <div style={{ background: 'rgba(9,24,40,0.9)', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 12, padding: '1.25rem', marginBottom: 20 }}>
                <div style={{ color: '#e8f1f8', fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Add a Show</div>
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={S.label}>Date</label>
                    <input type="date" className="bd-input" style={S.input} value={newShow.date}
                      onChange={e => setNewShow(s => ({ ...s, date: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.label}>Venue Name</label>
                    <input className="bd-input" style={S.input} value={newShow.venue_name} placeholder="Venue or TBD"
                      onChange={e => setNewShow(s => ({ ...s, venue_name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.label}>Notes</label>
                    <input className="bd-input" style={S.input} value={newShow.notes} placeholder="Optional"
                      onChange={e => setNewShow(s => ({ ...s, notes: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button disabled={addingShow || !newShow.date} onClick={async () => {
                    if (!band || !newShow.date) return;
                    setAddingShow(true);
                    await supabase.from('band_shows').insert({ band_id: band.id, show_date: newShow.date, venue_name: newShow.venue_name || 'TBD', notes: newShow.notes, created_by: userId });
                    setNewShow({ date: '', venue_name: '', notes: '' });
                    setShowForm(false);
                    setAddingShow(false);
                    await load();
                  }} style={{ padding: '8px 20px', background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: addingShow || !newShow.date ? 0.5 : 1 }}>
                    {addingShow ? 'Saving…' : 'Save Show'}
                  </button>
                  <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 7, color: '#7aa5c4', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}

            {/* 30-day outreach log */}
            {outreach.length > 0 && (
              <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 20 }}>
                <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: 12, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Agent Outreach — Last 30 Days
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {outreach.map(o => (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <span style={{ color: '#f59e0b', fontWeight: 700, minWidth: 60 }}>{o.days_ago === 0 ? 'Today' : `${o.days_ago}d ago`}</span>
                      <span style={{ color: '#e8f1f8', fontWeight: 600 }}>{o.venue_name}</span>
                      {o.venue_city && <span style={{ color: '#4a7a9b' }}>{o.venue_city}{o.venue_state ? `, ${o.venue_state}` : ''}</span>}
                      <span style={{ color: '#4a7a9b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.subject}</span>
                    </div>
                  ))}
                </div>
                <div style={{ color: '#4a7a9b', fontSize: 11, marginTop: 8 }}>Don't contact these venues independently — your agent is already working them.</div>
              </div>
            )}

            {/* Year grid — 12 months */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {MONTH_FULL.map((monthName, mIdx) => {
                const firstDay = new Date(calYear, mIdx, 1).getDay();
                const daysInMonth = new Date(calYear, mIdx + 1, 0).getDate();
                const monthShows = Object.entries(showsByDate).filter(([d]) => {
                  const dt = new Date(d + 'T00:00:00');
                  return dt.getFullYear() === calYear && dt.getMonth() === mIdx;
                });

                return (
                  <div key={mIdx} style={{ background: 'rgba(9,24,40,0.6)', border: '1px solid rgba(74,133,200,0.12)', borderRadius: 10, padding: 14 }}>
                    <div style={{ color: '#e8f1f8', fontWeight: 700, fontSize: 13, marginBottom: 10, letterSpacing: '0.04em' }}>{monthName}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                      {['S','M','T','W','T','F','S'].map((d, i) => (
                        <div key={i} style={{ textAlign: 'center', color: '#3d6285', fontSize: 10, fontWeight: 700, paddingBottom: 4 }}>{d}</div>
                      ))}
                      {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateKey = `${calYear}-${String(mIdx + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                        const dayShows = showsByDate[dateKey] || [];
                        return (
                          <div key={day}
                            className={`cal-day${dayShows.length ? ' has-show' : ''}`}
                            onClick={() => dayShows.length && setSelectedShow(dayShows[0])}
                          >
                            <div style={{ fontSize: 11, color: dayShows.length ? '#e8f1f8' : '#4a7a9b', fontWeight: dayShows.length ? 700 : 400, textAlign: 'center' }}>{day}</div>
                            {dayShows.length > 0 && (
                              <div style={{ fontSize: 9, color: dayShows[0].source === 'band' ? '#38bdf8' : '#22c55e', textAlign: 'center', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {dayShows[0].venue_name}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {monthShows.length > 0 && (
                      <div style={{ marginTop: 10, borderTop: '1px solid rgba(74,133,200,0.1)', paddingTop: 8 }}>
                        {monthShows.map(([d, s]) => (
                          <div key={d} onClick={() => setSelectedShow(s[0])}
                            style={{ fontSize: 11, color: '#7aa5c4', padding: '3px 6px', cursor: 'pointer', borderRadius: 4 }}>
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
        )}

        {/* ── Venues ───────────────────────────────────────────────────────── */}
        {activeTab === 'venues' && <VenueSearch />}

        {/* ── Campaigns ────────────────────────────────────────────────────── */}
        {activeTab === 'campaigns' && <CampaignManager />}

        {/* ── Email ────────────────────────────────────────────────────────── */}
        {activeTab === 'email' && <EmailTemplateManager />}

        {/* ── Settings ─────────────────────────────────────────────────────── */}
        {activeTab === 'settings' && (
          <div style={{ maxWidth: 680 }}>

            {/* Band Profile */}
            <div style={{ ...S.sectionHead, marginTop: 0 }}>Band Profile</div>
            {saveMsg && (
              <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600,
                background: saveMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
                border: `1px solid ${saveMsg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`,
                color: saveMsg.ok ? '#22c55e' : '#f87171' }}>
                {saveMsg.text}
              </div>
            )}
            <div style={S.field}>
              <label style={S.label}>Band Name</label>
              <input className="bd-input" style={S.input} value={band.band_name}
                onChange={e => setBand(b => b && ({ ...b, band_name: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={S.label}>Genre</label>
                <input className="bd-input" style={S.input} value={band.genre || ''}
                  placeholder="Country/Honky Tonk"
                  onChange={e => setBand(b => b && ({ ...b, genre: e.target.value }))} />
              </div>
              <div>
                <label style={S.label}>Home City</label>
                <input className="bd-input" style={S.input} value={band.home_city || ''}
                  onChange={e => setBand(b => b && ({ ...b, home_city: e.target.value }))} />
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>Bio</label>
              <textarea className="bd-input" style={{ ...S.textarea, minHeight: 120 }} value={band.bio || ''}
                placeholder="Tell bookers about the band…"
                onChange={e => setBand(b => b && ({ ...b, bio: e.target.value }))} />
            </div>
            <div style={S.field}>
              <label style={S.label}>EPK Link</label>
              <input className="bd-input" style={S.input} type="url" value={band.epk_link || ''}
                placeholder="https://yourband.com/epk"
                onChange={e => setBand(b => b && ({ ...b, epk_link: e.target.value }))} />
            </div>
            <div style={{ ...S.sectionHead }}>Socials & Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={S.label}>Instagram</label>
                <input className="bd-input" style={S.input} value={band.instagram || ''}
                  placeholder="@handle"
                  onChange={e => setBand(b => b && ({ ...b, instagram: e.target.value }))} />
              </div>
              <div>
                <label style={S.label}>Facebook</label>
                <input className="bd-input" style={S.input} value={band.facebook || ''}
                  placeholder="facebook.com/band"
                  onChange={e => setBand(b => b && ({ ...b, facebook: e.target.value }))} />
              </div>
              <div>
                <label style={S.label}>Website</label>
                <input className="bd-input" style={S.input} type="url" value={band.website || ''}
                  onChange={e => setBand(b => b && ({ ...b, website: e.target.value }))} />
              </div>
              <div>
                <label style={S.label}>Contact Email</label>
                <input className="bd-input" style={S.input} type="email" value={band.contact_email || ''}
                  onChange={e => setBand(b => b && ({ ...b, contact_email: e.target.value }))} />
              </div>
            </div>
            <button onClick={save} disabled={saving}
              style={{ padding: '11px 28px', background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save Profile'}
            </button>

            {/* Members */}
            <div style={{ ...S.sectionHead }}>Band Members</div>
            <div style={{ background: 'rgba(9,24,40,0.6)', border: '1px solid rgba(74,133,200,0.15)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
              <div style={{ color: '#e8f1f8', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Invite a Band Member</div>
              {inviteMsg && (
                <div style={{ padding: '8px 12px', borderRadius: 7, marginBottom: 12, fontSize: 13, fontWeight: 600,
                  background: inviteMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
                  border: `1px solid ${inviteMsg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`,
                  color: inviteMsg.ok ? '#22c55e' : '#f87171' }}>
                  {inviteMsg.text}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="bd-input" style={{ ...S.input, flex: 1 }}
                  type="email" placeholder="bandmember@email.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendInvite()}
                />
                <button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}
                  style={{ padding: '9px 18px', background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: !inviteEmail.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                  {inviting ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
            </div>
            {invites.length > 0 && (
              <>
                <div style={{ color: '#7aa5c4', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Pending Invites</div>
                {invites.map(inv => (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(74,133,200,0.1)', borderRadius: 8, marginBottom: 6 }}>
                    <span style={{ color: '#e8f1f8', fontSize: 13 }}>{inv.email}</span>
                    <span style={{ color: '#7aa5c4', fontSize: 11, background: 'rgba(74,133,200,0.1)', padding: '2px 8px', borderRadius: 4 }}>Invite sent</span>
                  </div>
                ))}
                <div style={{ marginBottom: 20 }} />
              </>
            )}
            <div style={{ color: '#7aa5c4', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Members ({members.length})</div>
            {members.length === 0 ? (
              <div style={{ color: '#4a7a9b', fontSize: 13, padding: '16px 0' }}>No members yet. Invite your bandmates above.</div>
            ) : members.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(74,133,200,0.1)', borderRadius: 8, marginBottom: 6 }}>
                <div>
                  <div style={{ color: '#e8f1f8', fontSize: 13, fontWeight: 600 }}>{m.profile?.display_name || '—'}</div>
                  <div style={{ color: '#4a7a9b', fontSize: 12 }}>{m.profile?.contact_email || ''}</div>
                </div>
                <span style={{ color: '#7aa5c4', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Show detail panel ────────────────────────────────────────────────── */}
      {selectedShow && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} onClick={() => setSelectedShow(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 51, background: '#091828', border: '1px solid rgba(74,133,200,0.3)', borderRadius: 14, padding: '28px 32px', width: 'min(420px, 92vw)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Confirmed Show</div>
              <button onClick={() => setSelectedShow(null)} style={{ background: 'none', border: 'none', color: '#4a7a9b', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ color: '#fff', fontFamily: "'Bebas Neue', cursive", fontSize: '1.8rem', letterSpacing: '0.05em', marginBottom: 4 }}>{selectedShow.venue_name}</div>
            <div style={{ color: '#7aa5c4', fontSize: 14, marginBottom: 20 }}>{selectedShow.venue_city}{selectedShow.venue_state ? `, ${selectedShow.venue_state}` : ''}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ color: '#4a7a9b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Date</div>
                <div style={{ color: '#e8f1f8', fontSize: 14 }}>{new Date(selectedShow.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</div>
              </div>
              {selectedShow.campaign_name && (
                <div>
                  <div style={{ color: '#4a7a9b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Run</div>
                  <div style={{ color: '#e8f1f8', fontSize: 14 }}>{selectedShow.campaign_name}</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
