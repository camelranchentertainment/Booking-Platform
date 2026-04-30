import { useState, useEffect, useRef } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { getAgentActIds } from '../lib/bookingQueries';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────────

type Visibility = 'agent_only' | 'band_admin' | 'all_members';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEAL_LABELS: Record<string, string> = {
  guarantee:  'Guarantee',
  door_split: 'Door Split',
  percentage: 'Percentage',
  flat_fee:   'Flat Fee',
  other:      'Other',
};

function fmt(t: string | null | undefined): string {
  if (!t) return 'TBD';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

// Renders markdown-lite note content (bullets, numbered lists, checkboxes)
function RenderNote({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const cbDone  = line.match(/^\[x\]\s*(.*)/i);
        const cbOpen  = line.match(/^\[ \]\s*(.*)/);
        const bullet  = line.match(/^[-*]\s+(.*)/);
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

// ── ShowCard ─────────────────────────────────────────────────────────────────

function ShowCard({ booking, role, label, dimPast }: { booking: any; role: string; label: string; dimPast?: boolean }) {
  const isAgent  = role === 'act_admin' || role === 'superadmin';
  const isMember = role === 'member';
  const v = booking.venue;
  const pendingFields: string[] = [];
  if (!booking.soundcheck_time) pendingFields.push('Soundcheck');
  if (!booking.set_time)        pendingFields.push('Set Time');
  if (!booking.load_in_time)    pendingFields.push('Load-in');

  return (
    <div className="card" style={{ opacity: dimPast ? 0.7 : 1 }}>
      <div className="card-header">
        <span className="card-title" style={{ color: 'var(--accent)' }}>{label}</span>
        {booking.tour && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            {booking.tourPosition ? `Day ${booking.tourPosition.current} of ${booking.tourPosition.total} · ` : ''}{booking.tour.name}
          </span>
        )}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--text-primary)', letterSpacing: '0.04em', lineHeight: 1.2 }}>
          {v?.name || 'Venue TBD'}
        </div>
        {v?.city && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            {v.city}, {v.state}{v.address && ` · ${v.address}`}
          </div>
        )}
        {v?.phone && (
          <a href={`tel:${v.phone}`} style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--accent)', display: 'block', marginTop: '0.1rem' }}>
            {v.phone}
          </a>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
        {([
          ['Load-in',    booking.load_in_time],
          ['Soundcheck', booking.soundcheck_time],
          ['Showtime',   booking.set_time],
          ['End Time',   booking.end_time],
        ] as [string, string | null][]).map(([lbl, val]) => (
          <div key={lbl} style={{ background: 'var(--bg-overlay)', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', borderLeft: `2px solid ${val ? 'var(--accent)' : '#f97316'}` }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.1rem' }}>{lbl}</div>
            <div style={{ color: val ? 'var(--text-primary)' : '#f97316', fontWeight: 600, fontSize: '0.9rem' }}>{fmt(val)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
        {([
          ['Sound',  booking.sound_system === 'house' ? 'House PA' : booking.sound_system === 'self' ? 'Self-Provided' : 'TBD'],
          ['Meals',  booking.meals_provided  ? 'Provided'  : 'Not provided'],
          ['Drinks', booking.drinks_provided ? 'Provided'  : 'Not provided'],
          ['Hotel',  booking.hotel_booked    ? 'Booked'    : 'Not booked'],
        ] as [string, string][]).map(([lbl, val]) => (
          <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{lbl}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{val}</span>
          </div>
        ))}
        {booking.lodging_details && (
          <div style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lodging</span>
            <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.5 }}>{booking.lodging_details}</div>
          </div>
        )}
        {booking.venue_contact_name && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contact</span>
            <span style={{ color: 'var(--text-secondary)' }}>{booking.venue_contact_name}</span>
          </div>
        )}
        {booking.special_requirements && (
          <div style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Special Requirements</span>
            <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.5 }}>{booking.special_requirements}</div>
          </div>
        )}
        {booking.advance_notes && !isMember && (
          <div style={{ padding: '0.3rem 0' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Advance Notes</span>
            <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.5 }}>{booking.advance_notes}</div>
          </div>
        )}
      </div>

      {!isMember && (booking.deal_type || booking.agreed_amount) && (
        <div style={{ marginTop: '1rem', padding: '0.65rem 0.9rem', background: 'rgba(200,146,26,0.06)', border: '1px solid rgba(200,146,26,0.2)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Deal</div>
          <div style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem' }}>
            {DEAL_LABELS[booking.deal_type] || booking.deal_type || 'TBD'}
            {booking.agreed_amount ? ` · $${Number(booking.agreed_amount).toLocaleString()}` : ''}
          </div>
        </div>
      )}

      {pendingFields.length > 0 && (
        <div style={{ marginTop: '0.75rem', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: '#f97316', fontFamily: 'var(--font-body)' }}>
          ⚠ Unconfirmed: {pendingFields.join(', ')}
          {isAgent && (
            <Link href={`/bookings/${booking.id}`} style={{ marginLeft: '0.5rem', color: 'var(--accent)', textDecoration: 'underline' }}>Fill in →</Link>
          )}
        </div>
      )}
    </div>
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

function NotesPanel({ userId, actId, tourId, tourName, todayStr, role, session }: NotesPanelProps) {
  const [noteId,     setNoteId]     = useState<string | null>(null);
  const [content,    setContent]    = useState('');
  const [visibility, setVisibility] = useState<Visibility>('agent_only');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Past notes modal
  const [showPast,      setShowPast]      = useState(false);
  const [pastTab,       setPastTab]       = useState<'date' | 'tour'>('date');
  const [noteDates,     setNoteDates]     = useState<string[]>([]);
  const [selectedDate,  setSelectedDate]  = useState<string | null>(null);
  const [pastNotes,     setPastNotes]     = useState<DailyNote[]>([]);
  const [tours,         setTours]         = useState<TourStub[]>([]);
  const [selectedTour,  setSelectedTour]  = useState('');
  const [tourNotes,     setTourNotes]     = useState<DailyNote[]>([]);
  const [loadingPast,   setLoadingPast]   = useState(false);

  // Refs so debounced save always uses the latest values (avoids stale closures)
  const contentRef    = useRef('');
  const visibilityRef = useRef<Visibility>('agent_only');
  const saveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authHeaders = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${session}`,
  };

  // Load today's note on mount / date change
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
        setNoteId(mine.id);
        contentRef.current    = mine.content ?? '';
        visibilityRef.current = mine.visibility ?? 'agent_only';
        setContent(mine.content ?? '');
        setVisibility(mine.visibility ?? 'agent_only');
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
    if (!res.ok) { setSaveStatus('idle'); return; }
    const { note } = await res.json();
    setNoteId(note.id);
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
      supabase
        .from('tours')
        .select('id, name, start_date, end_date')
        .neq('status', 'cancelled')
        .order('start_date', { ascending: false })
        .limit(30),
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
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', opts ?? { weekday: 'long', month: 'long', day: 'numeric' });

  const authorLabel = (n: DailyNote) => {
    const name = n.author?.display_name || n.author?.email || 'Unknown';
    return n.user_id === userId ? `${name} (you)` : name;
  };

  return (
    <div className="card" style={{ position: 'sticky', top: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
        <span className="card-title">NOTES</span>
        {saveStatus === 'saving' && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Saving…</span>
        )}
        {saveStatus === 'saved' && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: '#34d399', letterSpacing: '0.04em' }}>✓ Saved</span>
        )}
      </div>

      {/* Date + active tour context */}
      <div style={{ marginBottom: '0.65rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {todayStr ? fmtDate(todayStr) : ''}
        </div>
        {tourName && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--accent)', marginTop: '0.2rem' }}>
            ⟴ {tourName}
          </div>
        )}
      </div>

      {/* Textarea */}
      <textarea
        value={content}
        onChange={e => handleChange(e.target.value)}
        placeholder={'Notes for today…&#10;&#10;- bullet point&#10;1. numbered item&#10;[ ] checkbox&#10;[x] done'}
        style={{
          width:       '100%',
          minHeight:   220,
          background:  'var(--bg-base)',
          border:      '1px solid var(--border)',
          borderRadius:'var(--radius-sm)',
          color:       'var(--text-primary)',
          fontFamily:  'var(--font-body)',
          fontSize:    '0.84rem',
          lineHeight:  1.65,
          padding:     '0.7rem 0.8rem',
          resize:      'vertical',
          outline:     'none',
          boxSizing:   'border-box',
          whiteSpace:  'pre-wrap',
          transition:  'border-color 0.15s',
        }}
        onFocus={e  => { e.target.style.borderColor = 'var(--accent)'; }}
        onBlur={e   => { e.target.style.borderColor = 'var(--border)'; }}
      />

      {/* Visibility selector + Past Notes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.6rem' }}>
        <select
          value={visibility}
          onChange={e => handleVisibilityChange(e.target.value as Visibility)}
          style={{
            flex:         1,
            background:   'var(--bg-base)',
            border:       '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color:        'var(--text-secondary)',
            fontFamily:   'var(--font-body)',
            fontSize:     '0.72rem',
            padding:      '0.32rem 0.5rem',
            cursor:       'pointer',
          }}
        >
          <option value="agent_only">Only me</option>
          <option value="band_admin">Band Admin can see</option>
          <option value="all_members">Whole band can see</option>
        </select>

        <button
          onClick={openPastNotes}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: '0.72rem', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Past Notes
        </button>
      </div>

      {/* ── Past Notes Modal ────────────────────────────────────────────── */}
      {showPast && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowPast(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', width: '100%', maxWidth: 580, maxHeight: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {/* Modal header */}
            <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--accent)', letterSpacing: '0.05em' }}>PAST NOTES</span>
              <button
                onClick={() => setShowPast(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0.15rem 0.4rem' }}
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              {(['date', 'tour'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setPastTab(tab)}
                  style={{
                    flex:         1,
                    padding:      '0.6rem',
                    background:   'none',
                    border:       'none',
                    borderBottom: pastTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                    color:        pastTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                    fontFamily:   'var(--font-body)',
                    fontSize:     '0.76rem',
                    fontWeight:   pastTab === tab ? 600 : 400,
                    letterSpacing:'0.08em',
                    textTransform:'uppercase',
                    cursor:       'pointer',
                    transition:   'all 0.15s',
                  }}
                >
                  {tab === 'date' ? 'By Date' : 'By Tour'}
                </button>
              ))}
            </div>

            {/* Tab body */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {loadingPast ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading…</div>

              ) : pastTab === 'date' ? (
                /* ── By Date ──────────────────────────────────────── */
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                  {/* Date list */}
                  <div style={{ width: 155, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '0.5rem 0.4rem' }}>
                    {noteDates.length === 0 ? (
                      <div style={{ padding: '1rem 0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>No notes yet.</div>
                    ) : noteDates.map(d => (
                      <button
                        key={d}
                        onClick={() => loadDateNotes(d)}
                        style={{
                          display:      'block',
                          width:        '100%',
                          textAlign:    'left',
                          background:   selectedDate === d ? 'rgba(200,146,26,0.1)' : 'transparent',
                          border:       'none',
                          borderLeft:   selectedDate === d ? '2px solid var(--accent)' : '2px solid transparent',
                          color:        selectedDate === d ? 'var(--accent)' : 'var(--text-secondary)',
                          fontFamily:   'var(--font-mono)',
                          fontSize:     '0.7rem',
                          padding:      '0.45rem 0.65rem',
                          cursor:       'pointer',
                          borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                          marginBottom: '0.1rem',
                          transition:   'all 0.1s',
                        }}
                      >
                        {fmtDate(d, { month: 'short', day: 'numeric', year: '2-digit' })}
                      </button>
                    ))}
                  </div>

                  {/* Note viewer */}
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
                        <div style={{ fontSize: '0.83rem' }}>
                          <RenderNote text={n.content} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              ) : (
                /* ── By Tour ──────────────────────────────────────── */
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                  {/* Tour picker */}
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                    <select
                      value={selectedTour}
                      onChange={e => loadTourNotes(e.target.value)}
                      style={{
                        width:        '100%',
                        background:   'var(--bg-base)',
                        border:       '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color:        'var(--text-secondary)',
                        fontFamily:   'var(--font-body)',
                        fontSize:     '0.82rem',
                        padding:      '0.42rem 0.65rem',
                      }}
                    >
                      <option value="">— Select a tour —</option>
                      {tours.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Notes for tour */}
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
                        <div style={{ fontSize: '0.83rem' }}>
                          <RenderNote text={n.content} />
                        </div>
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
  const [role,         setRole]         = useState('');
  const [userId,       setUserId]       = useState('');
  const [userActId,    setUserActId]    = useState<string | null>(null);
  const [session,      setSession]      = useState('');
  const [today,        setToday]        = useState<any>(null);
  const [tomorrow,     setTomorrow]     = useState<any>(null);
  const [upcoming,     setUpcoming]     = useState<any>(null);
  const [activeTour,   setActiveTour]   = useState<{ id: string; name: string } | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [todayStr,     setTodayStr]     = useState('');
  const [tomorrowStr,  setTomorrowStr]  = useState('');

  useEffect(() => {
    const now  = new Date();
    const tom  = new Date(now); tom.setDate(tom.getDate() + 1);
    const td   = now.toISOString().substring(0, 10);
    const tm   = tom.toISOString().substring(0, 10);
    setTodayStr(td);
    setTomorrowStr(tm);
    load(td, tm);
  }, []);

  const load = async (td: string, tm: string) => {
    const [{ data: { user } }, { data: { session: sess } }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ]);
    if (!user || !sess) return;

    setUserId(user.id);
    setSession(sess.access_token);

    const { data: prof } = await supabase
      .from('user_profiles')
      .select('role, act_id')
      .eq('id', user.id)
      .maybeSingle();

    const userRole = prof?.role || 'member';
    setRole(userRole);

    // Resolve act IDs for booking queries
    let actIds: string[] = [];
    let resolvedActId: string | null = prof?.act_id ?? null;

    if (userRole === 'act_admin' || userRole === 'superadmin') {
      actIds = await getAgentActIds(supabase, user.id);
    } else {
      let aid = resolvedActId;
      if (!aid) {
        const { data: owned } = await supabase.from('acts').select('id').eq('owner_id', user.id).limit(1);
        if (owned?.length) { aid = owned[0].id; }
      }
      if (aid) {
        actIds        = [aid];
        resolvedActId = aid;
      }
    }
    setUserActId(resolvedActId);

    if (!actIds.length) { setLoading(false); return; }

    const bookingSelect = `
      id, show_date, load_in_time, soundcheck_time, set_time, end_time,
      set_length_min, sound_system, meals_provided, drinks_provided,
      hotel_booked, lodging_details, venue_contact_name, special_requirements,
      advance_notes, deal_type, agreed_amount, tour_id,
      venue:venues(id, name, city, state, address, phone),
      tour:tours(id, name)
    `;

    const [todayRes, tomorrowRes, upcomingRes] = await Promise.all([
      supabase.from('bookings').select(bookingSelect)
        .in('act_id', actIds).in('status', ['confirmed', 'advancing']).eq('show_date', td).limit(1),
      supabase.from('bookings').select(bookingSelect)
        .in('act_id', actIds).in('status', ['confirmed', 'advancing']).eq('show_date', tm).limit(1),
      supabase.from('bookings').select('id, show_date, venue:venues(name, city, state)')
        .in('act_id', actIds).in('status', ['confirmed', 'advancing']).gt('show_date', tm).order('show_date').limit(1),
    ]);

    const todayBooking    = todayRes.data?.[0]    ?? null;
    const tomorrowBooking = tomorrowRes.data?.[0] ?? null;
    const upcomingBooking = upcomingRes.data?.[0] ?? null;

    // Tour position for today's show
    if (todayBooking?.tour_id) {
      const { data: tourShows } = await supabase.from('bookings')
        .select('id, show_date').eq('tour_id', todayBooking.tour_id)
        .neq('status', 'cancelled').order('show_date');
      const sorted = (tourShows || []).filter((b: any) => b.show_date);
      const pos    = sorted.findIndex((b: any) => b.id === todayBooking.id);
      if (pos !== -1) (todayBooking as any).tourPosition = { current: pos + 1, total: sorted.length };
    }

    setToday(todayBooking);
    setTomorrow(tomorrowBooking);
    setUpcoming(upcomingBooking);

    // Resolve active tour: today's show tour OR most recent active/planning tour
    if (todayBooking?.tour) {
      const tourAny = todayBooking.tour as any;
      const tourName: string = (Array.isArray(tourAny) ? tourAny[0]?.name : tourAny?.name) ?? '';
      setActiveTour({ id: todayBooking.tour_id as string, name: tourName });
    } else if (actIds.length) {
      const { data: activeTours } = await supabase.from('tours')
        .select('id, name')
        .in('act_id', actIds)
        .in('status', ['active', 'planning'])
        .order('start_date', { ascending: false })
        .limit(1);
      const at = (activeTours as { id: string; name: string }[] | null)?.[0];
      if (at) setActiveTour({ id: at.id, name: at.name });
    }

    setLoading(false);
  };

  const dateLabel = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <AppShell requireRole={['act_admin', 'member']}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Today</h1>
          <div className="page-sub">{todayStr ? dateLabel(todayStr) : ''}</div>
        </div>
      </div>

      {/* Two-column layout: show cards left, notes panel right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', alignItems: 'start' }}>

        {/* Left — show cards */}
        <div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 280 }} />)}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {today ? (
                <ShowCard booking={today} role={role} label={`TODAY · ${dateLabel(todayStr)}`} />
              ) : (
                <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
                  No show today.
                </div>
              )}

              {tomorrow ? (
                <ShowCard booking={tomorrow} role={role} label={`TOMORROW · ${dateLabel(tomorrowStr)}`} />
              ) : (
                <div className="card" style={{ padding: '1rem 1.25rem' }}>
                  <div className="card-header"><span className="card-title">TOMORROW</span></div>
                  {upcoming ? (
                    <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
                      No show tomorrow. Next show:{' '}
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{upcoming.venue?.name}</span>
                      {upcoming.venue?.city && ` · ${upcoming.venue.city}, ${upcoming.venue.state}`}
                      {upcoming.show_date && ` on ${dateLabel(upcoming.show_date)}`}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
                      No upcoming shows scheduled.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right — notes panel (shown once session is resolved) */}
        {session && (
          <NotesPanel
            userId={userId}
            actId={userActId}
            tourId={activeTour?.id   ?? null}
            tourName={activeTour?.name ?? null}
            todayStr={todayStr}
            role={role}
            session={session}
          />
        )}
      </div>
    </AppShell>
  );
}
