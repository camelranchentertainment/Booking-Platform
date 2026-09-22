import { useState, useEffect, useRef, CSSProperties } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { formatShowDate } from '../lib/formatDate';

// ── Types ────────────────────────────────────────────────────────────────────

type Visibility = 'admin_only' | 'band_admin' | 'all_members';

interface DailyNote {
  id: string;
  user_id: string;
  act_id: string | null;
  tour_id: string | null;
  note_date: string;
  content: string;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
  author?: { display_name: string | null; email: string | null } | null;
}

interface TourStub {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

// ── Shared card style ────────────────────────────────────────────────────────

const CARD: CSSProperties = {
  borderRadius: 18,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  padding: 22,
};

const EYEBROW: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 15,
  letterSpacing: '1.5px',
  color: 'var(--text-muted)',
  display: 'block',
};

// ── Icons ────────────────────────────────────────────────────────────────────

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CheckCalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 13l2.5 2.5L16 10" />
    </svg>
  );
}

function StatusBadge({ green }: { green: boolean }) {
  return (
    <span style={{
      width: 38, height: 38, borderRadius: 10, flexShrink: 0,
      background: green ? 'rgba(74,222,128,0.16)' : 'var(--surface-2)',
      color: green ? 'var(--green)' : 'var(--text-muted)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {green ? <CheckCalendarIcon /> : <CalendarIcon />}
    </span>
  );
}

// ── RenderNote ────────────────────────────────────────────────────────────────

function RenderNote({ text }: { text: string }) {
  if (!text) return null;
  return (
    <>
      {text.split('\n').map((line, i) => {
        const cbDone   = line.match(/^\[x\]\s*(.*)/i);
        const cbOpen   = line.match(/^\[ \]\s*(.*)/);
        const bullet   = line.match(/^[-*]\s+(.*)/);
        const numbered = line.match(/^(\d+)\.\s+(.*)/);

        if (cbDone) return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', marginBottom: '0.2rem' }}>
            <span style={{ color: '#34d399', flexShrink: 0, marginTop: 1 }}>✓</span>
            <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through', lineHeight: 1.5 }}>{cbDone[1]}</span>
          </div>
        );
        if (cbOpen) return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', marginBottom: '0.2rem' }}>
            <span style={{ flexShrink: 0, display: 'inline-block', width: 13, height: 13, border: '1px solid var(--border)', borderRadius: 2, marginTop: 3 }} />
            <span style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>{cbOpen[1]}</span>
          </div>
        );
        if (bullet) return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.2rem' }}>
            <span style={{ color: 'var(--accent)', flexShrink: 0, fontSize: '1rem', lineHeight: 1.3 }}>·</span>
            <span style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>{bullet[1]}</span>
          </div>
        );
        if (numbered) return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', marginBottom: '0.2rem' }}>
            <span style={{ color: 'var(--accent)', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '0.76rem', lineHeight: 1.6, minWidth: '1.2rem' }}>{numbered[1]}.</span>
            <span style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>{numbered[2]}</span>
          </div>
        );
        if (line === '') return <div key={i} style={{ height: '0.4rem' }} />;
        return <div key={i} style={{ color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '0.1rem' }}>{line}</div>;
      })}
    </>
  );
}

// ── NotesPanel ────────────────────────────────────────────────────────────────

interface NotesPanelProps {
  userId: string;
  actId: string | null;
  tourId: string | null;
  tourName: string | null;
  todayStr: string;
  role: string;
  session: string;
}

const VIS_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'admin_only',  label: 'ONLY ME' },
  { value: 'band_admin',  label: 'BAND ADMIN CAN SEE' },
  { value: 'all_members', label: 'WHOLE BAND CAN SEE' },
];

function NotesPanel({ userId, actId, tourId, tourName, todayStr, session }: NotesPanelProps) {
  const [content,    setContent]    = useState('');
  const [visibility, setVisibility] = useState<Visibility>('admin_only');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [showPast,     setShowPast]     = useState(false);
  const [pastTab,      setPastTab]      = useState<'date' | 'tour'>('date');
  const [noteDates,    setNoteDates]    = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pastNotes,    setPastNotes]    = useState<DailyNote[]>([]);
  const [tours,        setTours]        = useState<TourStub[]>([]);
  const [selectedTour, setSelectedTour] = useState('');
  const [tourNotes,    setTourNotes]    = useState<DailyNote[]>([]);
  const [loadingPast,  setLoadingPast]  = useState(false);

  const contentRef    = useRef('');
  const visibilityRef = useRef<Visibility>('admin_only');
  const saveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authHeaders = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${session}`,
  };

  useEffect(() => {
    if (!todayStr || !session) return;
    (async () => {
      const res = await fetch(`/api/notes?date=${todayStr}&view=day`, {
        headers: { Authorization: `Bearer ${session}` },
      });
      if (!res.ok) return;
      const { notes } = (await res.json()) as { notes: DailyNote[] };
      const mine = notes.find((n) => n.user_id === userId);
      if (mine) {
        contentRef.current    = mine.content ?? '';
        visibilityRef.current = mine.visibility ?? 'admin_only';
        setContent(mine.content ?? '');
        setVisibility(mine.visibility ?? 'admin_only');
        setSaveStatus('saved');
      }
    })();
  }, [todayStr, session]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerSave = async () => {
    setSaveStatus('saving');
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        content:    contentRef.current,
        note_date:  todayStr,
        tour_id:    tourId  ?? null,
        act_id:     actId   ?? null,
        visibility: visibilityRef.current,
      }),
    });
    if (!res.ok) { setSaveStatus('error'); return; }
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 2000);
  };

  const scheduleAutosave = (delayMs = 2000) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(triggerSave, delayMs);
  };

  const handleChange = (val: string) => {
    contentRef.current = val;
    setContent(val);
    setSaveStatus('idle');
    scheduleAutosave(2000);
  };

  const handleVisibilityChange = (vis: Visibility) => {
    visibilityRef.current = vis;
    setVisibility(vis);
    scheduleAutosave(500);
  };

  const openPastNotes = async () => {
    setShowPast(true);
    setLoadingPast(true);
    setSelectedDate(null);
    setPastNotes([]);
    setSelectedTour('');
    setTourNotes([]);

    const [datesRes, toursRes] = await Promise.all([
      fetch('/api/notes?view=dates', { headers: { Authorization: `Bearer ${session}` } }),
      supabase.from('tours').select('id, name, start_date, end_date')
        .neq('status', 'cancelled').order('start_date', { ascending: false }).limit(30),
    ]);

    if (datesRes.ok) {
      const { dates } = await datesRes.json();
      setNoteDates(dates ?? []);
    }
    setTours((toursRes.data as TourStub[]) ?? []);
    setLoadingPast(false);
  };

  const loadDateNotes = async (date: string) => {
    setSelectedDate(date);
    setPastNotes([]);
    const res = await fetch(`/api/notes?date=${date}&view=day`, {
      headers: { Authorization: `Bearer ${session}` },
    });
    if (res.ok) {
      const { notes } = await res.json();
      setPastNotes(notes ?? []);
    }
  };

  const loadTourNotes = async (tid: string) => {
    setSelectedTour(tid);
    setTourNotes([]);
    if (!tid) return;
    const res = await fetch(`/api/notes?tour_id=${tid}&view=tour`, {
      headers: { Authorization: `Bearer ${session}` },
    });
    if (res.ok) {
      const { notes } = await res.json();
      setTourNotes(notes ?? []);
    }
  };

  const fmtDate = (d: string, opts?: Intl.DateTimeFormatOptions) =>
    formatShowDate(d, opts ?? { weekday: 'long', month: 'long', day: 'numeric' });

  const authorLabel = (n: DailyNote) => {
    const name = n.author?.display_name || n.author?.email || 'Unknown';
    return n.user_id === userId ? `${name} (you)` : name;
  };

  const saveLabel =
    saveStatus === 'saving' ? 'Saving…' :
    saveStatus === 'saved'  ? 'Saved ✓' :
    saveStatus === 'error'  ? 'Failed'  :
    'Save note';

  const saveBg =
    saveStatus === 'saved'  ? '#10b981' :
    saveStatus === 'error'  ? '#f87171' :
    'var(--accent)';

  return (
    <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Eyebrow */}
      <span style={EYEBROW}>NOTES</span>

      {/* Date + tour pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
          {todayStr ? fmtDate(todayStr) : ''}
        </span>
        {tourName && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: '0.5px',
            background: 'rgba(200,146,26,0.16)', color: 'var(--accent)',
            border: '1px solid rgba(200,146,26,0.3)',
            fontFamily: 'var(--font-body)',
          }}>
            ⟲ {tourName}
          </span>
        )}
      </div>

      {/* Visibility pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {VIS_OPTIONS.map(({ value, label }) => {
          const active = visibility === value;
          return (
            <button
              key={value}
              onClick={() => handleVisibilityChange(value)}
              style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '6px 14px', borderRadius: 999,
                fontSize: 10.5, fontWeight: 800, letterSpacing: '0.5px',
                fontFamily: 'var(--font-body)', cursor: 'pointer',
                background: active ? 'rgba(200,146,26,0.16)' : 'var(--surface-2)',
                color:      active ? 'var(--accent)' : 'var(--text-muted)',
                border:     active ? '1px solid rgba(200,146,26,0.35)' : '1px solid var(--border)',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Textarea */}
      <textarea
        value={content}
        onChange={e => handleChange(e.target.value)}
        placeholder="Write a note for today..."
        style={{
          flexGrow: 1, minHeight: 120, resize: 'none',
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 14, color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6,
          outline: 'none', boxSizing: 'border-box', whiteSpace: 'pre-wrap',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { e.target.style.borderColor = 'var(--accent)'; }}
        onBlur={e  => { e.target.style.borderColor = 'var(--border)'; }}
      />

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={openPastNotes}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            color: 'var(--accent)', fontSize: 12.5, fontWeight: 800, fontFamily: 'var(--font-body)',
          }}
        >
          Past notes →
        </button>
        <button
          onClick={triggerSave}
          disabled={saveStatus === 'saving'}
          style={{
            padding: '9px 18px', borderRadius: 10, border: 'none',
            background: saveBg, color: '#161616',
            fontSize: 12.5, fontWeight: 800, fontFamily: 'var(--font-body)',
            cursor: saveStatus === 'saving' ? 'default' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {saveLabel}
        </button>
      </div>

      {/* Past Notes Modal */}
      {showPast && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowPast(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', width: '100%', maxWidth: 580, maxHeight: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--accent)', letterSpacing: '0.05em' }}>PAST NOTES</span>
              <button onClick={() => setShowPast(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0.15rem 0.4rem' }}>✕</button>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              {(['date', 'tour'] as const).map(tab => (
                <button key={tab} onClick={() => setPastTab(tab)} style={{
                  flex: 1, padding: '0.6rem', background: 'none', border: 'none',
                  borderBottom: pastTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                  color: pastTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-body)', fontSize: '0.76rem', fontWeight: pastTab === tab ? 600 : 400,
                  letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {tab === 'date' ? 'By Date' : 'By Tour'}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {loadingPast ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading…</div>

              ) : pastTab === 'date' ? (
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                  <div style={{ width: 155, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '0.5rem 0.4rem' }}>
                    {noteDates.length === 0 ? (
                      <div style={{ padding: '1rem 0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>No notes yet.</div>
                    ) : noteDates.map(d => (
                      <button key={d} onClick={() => loadDateNotes(d)} style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        background: selectedDate === d ? 'rgba(224,120,32,0.1)' : 'transparent',
                        border: 'none', borderLeft: selectedDate === d ? '2px solid var(--accent)' : '2px solid transparent',
                        color: selectedDate === d ? 'var(--accent)' : 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                        padding: '0.45rem 0.65rem', cursor: 'pointer',
                        borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', marginBottom: '0.1rem', transition: 'all 0.1s',
                      }}>
                        {fmtDate(d, { month: 'short', day: 'numeric', year: '2-digit' })}
                      </button>
                    ))}
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>
                    {!selectedDate ? (
                      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>← Select a date</div>
                    ) : pastNotes.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>No notes for this date.</div>
                    ) : pastNotes.map((n) => (
                      <div key={n.id} style={{ marginBottom: '1.25rem' }}>
                        {pastNotes.length > 1 && (
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, color: n.user_id === userId ? 'var(--accent)' : '#a78bfa', marginBottom: '0.35rem' }}>
                            {authorLabel(n)}
                          </div>
                        )}
                        <div style={{ fontSize: '0.83rem' }}><RenderNote text={n.content} /></div>
                      </div>
                    ))}
                  </div>
                </div>

              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                    <select value={selectedTour} onChange={e => loadTourNotes(e.target.value)} style={{
                      width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-body)', fontSize: '0.82rem', padding: '0.42rem 0.65rem',
                    }}>
                      <option value="">— Select a tour —</option>
                      {tours.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>
                    {!selectedTour ? (
                      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>Select a tour to see its notes.</div>
                    ) : tourNotes.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>No notes written during this tour.</div>
                    ) : tourNotes.map((n) => (
                      <div key={n.id} style={{ marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', gap: '0.5rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                            {fmtDate(n.note_date, { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: n.user_id === userId ? 'var(--accent)' : '#a78bfa' }}>
                            {authorLabel(n)}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.83rem' }}><RenderNote text={n.content} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TodayPage ─────────────────────────────────────────────────────────────────

export default function TodayPage() {
  const [userId,      setUserId]      = useState('');
  const [userActId,   setUserActId]   = useState<string | null>(null);
  const [session,     setSession]     = useState('');
  const [today,       setToday]       = useState<any>(null);
  const [tomorrow,    setTomorrow]    = useState<any>(null);
  const [upcoming,    setUpcoming]    = useState<any>(null);
  const [activeTour,  setActiveTour]  = useState<{ id: string; name: string } | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [todayStr,    setTodayStr]    = useState('');
  const [tomorrowStr, setTomorrowStr] = useState('');

  useEffect(() => {
    const now = new Date();
    const tom = new Date(now); tom.setDate(tom.getDate() + 1);
    const td  = now.toISOString().substring(0, 10);
    const tm  = tom.toISOString().substring(0, 10);
    setTodayStr(td);
    setTomorrowStr(tm);
    load(td, tm);
  }, []);

  const load = async (td: string, tm: string) => {
    setLoading(true);
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      if (!sess) return;

      setUserId(sess.user.id);
      setSession(sess.access_token);

      const { data: prof } = await supabase
        .from('profiles').select('role, act_id').eq('id', sess.user.id).maybeSingle();

      const actId = prof?.act_id ?? null;
      setUserActId(actId);
      if (!actId) return;

      const bookingSelect = `
        id, show_date, status, tour_id,
        venue:venues(id, name, city, state)
      `;

      const [todayRes, tomorrowRes, upcomingRes] = await Promise.all([
        supabase.from('bookings').select(bookingSelect)
          .eq('act_id', actId).eq('status', 'confirmed').eq('show_date', td).limit(1),
        supabase.from('bookings').select(bookingSelect)
          .eq('act_id', actId).eq('status', 'confirmed').eq('show_date', tm).limit(1),
        supabase.from('bookings').select('id, show_date, venue:venues(name, city, state)')
          .eq('act_id', actId).eq('status', 'confirmed').gt('show_date', tm).order('show_date').limit(1),
      ]);

      const todayBooking    = todayRes.data?.[0]    ?? null;
      const tomorrowBooking = tomorrowRes.data?.[0] ?? null;
      const upcomingBooking = upcomingRes.data?.[0] ?? null;

      setToday(todayBooking);
      setTomorrow(tomorrowBooking);
      setUpcoming(upcomingBooking);

      // Active tour: today's show tour, or most recent active/planning tour
      if (todayBooking?.tour_id) {
        const { data: tourData } = await supabase
          .from('tours').select('id, name').eq('id', todayBooking.tour_id).maybeSingle();
        if (tourData) setActiveTour({ id: tourData.id, name: tourData.name });
      } else {
        const { data: activeTours } = await supabase.from('tours')
          .select('id, name').eq('act_id', actId)
          .in('status', ['active', 'planning']).order('start_date', { ascending: false }).limit(1);
        const at = (activeTours as { id: string; name: string }[] | null)?.[0];
        if (at) setActiveTour({ id: at.id, name: at.name });
      }
    } catch (err) {
      console.error('today load:', err);
    } finally {
      setLoading(false);
    }
  };

  const dateLabel = (d: string) =>
    formatShowDate(d, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <AppShell requireRole={['band_admin', 'member']}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Today</h1>
          <div className="page-sub">{todayStr ? dateLabel(todayStr) : ''}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>

        {/* Left column — Today + Tomorrow cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* TODAY */}
          <div style={CARD}>
            <span style={EYEBROW}>TODAY</span>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              {loading ? (
                <div className="skeleton" style={{ height: 38, width: '100%', borderRadius: 10 }} />
              ) : today ? (
                <>
                  <StatusBadge green />
                  <span style={{ fontSize: 14.5, lineHeight: 1.4 }}>
                    <strong>{today.venue?.name || 'Venue TBD'}</strong>
                    {today.venue?.city && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        {' '}· {today.venue.city}, {today.venue.state}
                      </span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <StatusBadge green={false} />
                  <span style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>No show today.</span>
                </>
              )}
            </div>
          </div>

          {/* TOMORROW */}
          <div style={CARD}>
            <span style={EYEBROW}>TOMORROW</span>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              {loading ? (
                <div className="skeleton" style={{ height: 38, width: '100%', borderRadius: 10 }} />
              ) : tomorrow ? (
                <>
                  <StatusBadge green />
                  <span style={{ fontSize: 14.5, lineHeight: 1.4 }}>
                    <strong>{tomorrow.venue?.name || 'Venue TBD'}</strong>
                    {tomorrow.venue?.city && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        {' '}· {tomorrow.venue.city}, {tomorrow.venue.state}
                      </span>
                    )}
                  </span>
                </>
              ) : upcoming ? (
                <>
                  <StatusBadge green />
                  <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                    No show tomorrow. Next show:{' '}
                    <strong>{upcoming.venue?.name}</strong>
                    {upcoming.venue?.city && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        {' '}· {upcoming.venue.city}, {upcoming.venue.state}
                      </span>
                    )}
                    {upcoming.show_date && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        {' '}on {dateLabel(upcoming.show_date)}
                      </span>
                    )}.
                  </span>
                </>
              ) : (
                <>
                  <StatusBadge green={false} />
                  <span style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>No upcoming shows.</span>
                </>
              )}
            </div>
          </div>

        </div>

        {/* Right column — Notes */}
        {session && (
          <NotesPanel
            userId={userId}
            actId={userActId}
            tourId={activeTour?.id   ?? null}
            tourName={activeTour?.name ?? null}
            todayStr={todayStr}
            role=""
            session={session}
          />
        )}
        {!session && !loading && (
          <div style={{ ...CARD, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
            Sign in to write notes.
          </div>
        )}

      </div>
    </AppShell>
  );
}
