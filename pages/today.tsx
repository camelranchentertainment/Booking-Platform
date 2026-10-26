// pages/today.tsx
//
// Today — the show-day view for band admins and members.
//
// Layout (Phase 3 redesign, Oct 2026 — matches the Tours page):
//   1. Illustrated "show night" hero with the date and a one-line status.
//   2. Left column: tonight's show(s) as a day sheet — run-of-show strip,
//      where-to-go, logistics, and (admins only) the deal and advance notes.
//      Off days get the next show instead. Then a compact "Tomorrow" card.
//   3. Right column: today's notes, with visibility and past-notes browser.
//
// All counting/formatting lives in lib/domain/showDay.ts (unit-tested); this
// file loads rows, holds UI state and renders.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '../components/layout/AppShell';
import PageHero from '../components/layout/PageHero';
import ShowNightScene from '../components/today/ShowNightScene';
import { supabase } from '../lib/supabase';
import { formatShowDate, localToday } from '../lib/formatDate';
import {
  SHOW_DAY_STATUSES, formatClock, runOfShow, missingTimes, logisticsRows, dealSummary,
  cityLine, mapsLink, addDays, daysBetween, tourPosition, heroSummary,
  type ShowDayBooking, type ShowDayVenue,
} from '../lib/domain/showDay';
import { telHref } from '../lib/showDayContacts';

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface TourStub { id: string; name: string; start_date: string | null; end_date: string | null }

/** A booking on the page, with its position on its tour when it has one. */
interface DayShow extends ShowDayBooking { position: { current: number; total: number } | null }

interface NextShow { id: string; show_date: string; venue: Pick<ShowDayVenue, 'name' | 'city' | 'state'> | null }

type LoadResult =
  | { kind: 'ok'; userId: string; actId: string; role: string; token: string;
      todayShows: DayShow[]; tomorrowShows: DayShow[]; next: NextShow | null;
      activeTour: { id: string; name: string } | null }
  | { kind: 'no-band'; userId: string; role: string; token: string }
  | { kind: 'signed-out' }
  | { kind: 'error' };

const STATUS_LABELS: Readonly<Record<string, string>> = {
  contract: 'Contract', confirmed: 'Confirmed', advancing: 'Advancing', completed: 'Played',
};

// Deal and advance fields are fetched for admins only: members never see
// financial data, and leaving them out of the query keeps them off the wire.
const BASE_FIELDS = `
  id, show_date, status, tour_id,
  load_in_time, soundcheck_time, set_time, end_time,
  sound_system, meals_provided, drinks_provided, hotel_booked,
  lodging_details, venue_contact_name, day_of_contact_phone,
  sound_engineer_name, sound_engineer_phone, special_requirements,
  venue:venues(id, name, city, state, address, phone),
  tour:tours(id, name)`;
const ADMIN_FIELDS = `${BASE_FIELDS}, advance_notes, deal_type, agreed_amount`;

const isAdminRole = (role: string): boolean => role === 'band_admin' || role === 'superadmin';

/** PostgREST returns a to-one embed as an object, but the generated types allow an array. Take the first either way. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Fills in fields the member query leaves out, so every row has the full ShowDayBooking shape. */
function toBooking(row: Record<string, unknown>): ShowDayBooking {
  // The row comes from the typed select above; the cast only widens nullable embeds.
  const r = row as unknown as ShowDayBooking & { venue: unknown; tour: unknown };
  return {
    ...r,
    advance_notes: r.advance_notes ?? null,
    deal_type: r.deal_type ?? null,
    agreed_amount: r.agreed_amount ?? null,
    venue: one(r.venue as ShowDayVenue | ShowDayVenue[] | null),
    tour: one(r.tour as { id: string; name: string } | { id: string; name: string }[] | null),
  };
}

/** Each show's place on its tour ("Day 3 of 8"), from one query per tour. */
async function withTourPositions(actId: string, shows: ShowDayBooking[]): Promise<DayShow[]> {
  const tourIds = [...new Set(shows.map(s => s.tour_id).filter((id): id is string => !!id))];
  if (tourIds.length === 0) return shows.map(s => ({ ...s, position: null }));
  const { data, error } = await supabase
    .from('bookings')
    .select('id, tour_id, show_date')
    .eq('act_id', actId)
    .in('tour_id', tourIds)
    .in('status', [...SHOW_DAY_STATUSES]);
  if (error) console.error('[today] tour positions failed', error);
  const rows = (data ?? []) as { id: string; tour_id: string; show_date: string | null }[];
  return shows.map(s => ({
    ...s,
    position: s.tour_id ? tourPosition(s.id, rows.filter(r => r.tour_id === s.tour_id)) : null,
  }));
}

/**
 * Loads today's and tomorrow's booked shows, the next show after tomorrow and
 * the active tour for the signed-in user's band. RLS scopes every query to the
 * caller's band; the act_id filters keep them explicit. Never throws.
 */
async function loadToday(today: string, tomorrow: string): Promise<LoadResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { kind: 'signed-out' };
    const userId = session.user.id;
    const token = session.access_token;

    const { data: prof, error: profErr } = await supabase
      .from('profiles').select('role, act_id').eq('id', userId).maybeSingle();
    if (profErr) { console.error('[today] profile load failed', profErr); return { kind: 'error' }; }
    const role = (prof?.role as string | undefined) ?? 'member';
    const actId = (prof?.act_id as string | null | undefined) ?? null;
    if (!actId) return { kind: 'no-band', userId, role, token };

    const fields = isAdminRole(role) ? ADMIN_FIELDS : BASE_FIELDS;
    const statuses = [...SHOW_DAY_STATUSES];
    const [todayRes, tomorrowRes, nextRes, tourRes] = await Promise.all([
      supabase.from('bookings').select(fields).eq('act_id', actId).in('status', statuses).eq('show_date', today).order('set_time', { nullsFirst: false }),
      supabase.from('bookings').select(fields).eq('act_id', actId).in('status', statuses).eq('show_date', tomorrow).order('set_time', { nullsFirst: false }),
      supabase.from('bookings').select('id, show_date, venue:venues(name, city, state)')
        .eq('act_id', actId).in('status', statuses).gt('show_date', tomorrow).order('show_date').limit(1),
      supabase.from('tours').select('id, name').eq('act_id', actId)
        .in('status', ['active', 'planning']).order('start_date', { ascending: false }).limit(1),
    ]);
    if (todayRes.error || tomorrowRes.error || nextRes.error) {
      console.error('[today] load failed', { today: todayRes.error, tomorrow: tomorrowRes.error, next: nextRes.error });
      return { kind: 'error' };
    }

    const todayRows = ((todayRes.data ?? []) as unknown as Record<string, unknown>[]).map(toBooking);
    const tomorrowRows = ((tomorrowRes.data ?? []) as unknown as Record<string, unknown>[]).map(toBooking);
    const [todayShows, tomorrowShows] = await Promise.all([
      withTourPositions(actId, todayRows),
      withTourPositions(actId, tomorrowRows),
    ]);

    const nextRow = (nextRes.data ?? [])[0] as unknown as { id: string; show_date: string; venue: unknown } | undefined;
    const next: NextShow | null = nextRow
      ? { id: nextRow.id, show_date: nextRow.show_date, venue: one(nextRow.venue as NextShow['venue'] | NextShow['venue'][]) }
      : null;

    // Notes attach to tonight's tour first, else the band's current run.
    const tonightTour = todayShows.find(s => s.tour)?.tour ?? null;
    const runningTour = ((tourRes.data ?? []) as { id: string; name: string }[])[0] ?? null;

    return { kind: 'ok', userId, actId, role, token, todayShows, tomorrowShows, next, activeTour: tonightTour ?? runningTour };
  } catch (err) {
    console.error('[today] load threw', err);
    return { kind: 'error' };
  }
}

// ── Show pieces ───────────────────────────────────────────────────────────────

/** Load-in → Soundcheck → Showtime → End, with blanks flagged. */
function RunOfShow({ booking }: { booking: ShowDayBooking }) {
  return (
    <ol className="today-run" aria-label="Run of show">
      {runOfShow(booking).map(step => {
        const time = formatClock(step.time);
        const missing = !time && step.required;
        return (
          <li key={step.key} className={`today-run-step${missing ? ' today-run-step--missing' : ''}${!time && !step.required ? ' today-run-step--idle' : ''}`}>
            <span className="today-run-label">{step.label}</span>
            <span className="today-run-time">{time ?? 'TBD'}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** One show-day person: name, and a Call chip when the phone is dialable. */
function ShowDayPersonLine({ label, name, phone }: { label: string; name: string | null; phone: string | null }) {
  if (!name && !phone) return null;
  const href = telHref(phone);
  return (
    <p className="today-where-contact">
      <span>{label}</span> {name || 'No name on file'}
      {phone && (href
        ? <> <a className="today-chip-link" href={href} aria-label={`Call ${label === 'Sound' ? 'the sound engineer' : 'the day-of contact'}${name ? `, ${name},` : ''} at ${phone}`}>Call {phone}</a></>
        : <> · {phone}</>)}
    </p>
  );
}

/** Address, maps, phone and the show-day contacts. */
function WhereBlock({ booking }: { booking: ShowDayBooking }) {
  const v = booking.venue;
  const maps = mapsLink(v);
  return (
    <section className="today-block" aria-label="Where">
      <h3 className="today-block-title">Where</h3>
      <p className="today-where-address">{v?.address || cityLine(v) || 'Address not on file'}</p>
      <div className="today-where-actions">
        {maps && (
          <a className="today-chip-link" href={maps} target="_blank" rel="noopener noreferrer">
            Directions ↗<span className="sr-only"> (opens Google Maps in a new tab)</span>
          </a>
        )}
        {v?.phone && <a className="today-chip-link" href={`tel:${v.phone}`}>Call {v.phone}</a>}
      </div>
      <ShowDayPersonLine label="Day-of" name={booking.venue_contact_name} phone={booking.day_of_contact_phone} />
      <ShowDayPersonLine label="Sound" name={booking.sound_engineer_name} phone={booking.sound_engineer_phone} />
    </section>
  );
}

/** Sound / meals / drinks / hotel with sorted-or-not dots. */
function LogisticsBlock({ booking }: { booking: ShowDayBooking }) {
  return (
    <section className="today-block" aria-label="Logistics">
      <h3 className="today-block-title">Logistics</h3>
      <dl className="today-logistics">
        {logisticsRows(booking).map(row => (
          <div key={row.label} className="today-logistics-row">
            <dt>{row.label}</dt>
            <dd>
              <span className={`today-dot${row.ok ? ' today-dot--ok' : ''}`} aria-hidden="true" />
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Free-text day-sheet fields, only when filled in. Advance notes are admin-only. */
function NotesBlocks({ booking, isAdmin }: { booking: ShowDayBooking; isAdmin: boolean }) {
  const items: [string, string | null][] = [
    ['Lodging', booking.lodging_details],
    ['Requirements', booking.special_requirements],
    ...(isAdmin ? [['Advance notes', booking.advance_notes] as [string, string | null]] : []),
  ];
  const filled = items.filter(([, text]) => !!text?.trim());
  if (filled.length === 0) return null;
  return (
    <div className="today-text-blocks">
      {filled.map(([label, text]) => (
        <section key={label} className="today-text-block">
          <h3 className="today-block-title">{label}</h3>
          <p>{text}</p>
        </section>
      ))}
    </div>
  );
}

/** Tonight's full day sheet. */
function ShowCard({ show, isAdmin, eyebrow }: { show: DayShow; isAdmin: boolean; eyebrow: string }) {
  const where = cityLine(show.venue);
  const missing = missingTimes(show);
  const deal = isAdmin ? dealSummary(show) : null;
  return (
    <article className="today-show" aria-labelledby={`show-${show.id}`}>
      <header className="today-show-head">
        <div className="today-show-title-block">
          <span className="today-eyebrow">
            {eyebrow}
            {show.tour && (
              <span className="today-eyebrow-tour">
                {' '}· {show.position ? `Day ${show.position.current} of ${show.position.total} · ` : ''}{show.tour.name}
              </span>
            )}
          </span>
          <h2 className="today-show-name" id={`show-${show.id}`}>{show.venue?.name || 'Venue TBD'}</h2>
          {where && <span className="today-show-where">{where}</span>}
        </div>
        <span className={`tour-badge ${show.status === 'advancing' ? 'tour-badge--done' : 'tour-badge--live'}`}>
          {STATUS_LABELS[show.status] ?? show.status}
        </span>
      </header>

      <RunOfShow booking={show} />

      <div className="today-show-grid">
        <WhereBlock booking={show} />
        <LogisticsBlock booking={show} />
      </div>

      <NotesBlocks booking={show} isAdmin={isAdmin} />

      {deal && (
        <div className="today-deal">
          <span className="today-block-title">Deal</span>
          <strong>{deal}</strong>
        </div>
      )}

      {(missing.length > 0 || isAdmin) && (
        <footer className="today-show-foot">
          {missing.length > 0 ? (
            <p className="today-missing" role="status">
              <span aria-hidden="true">⚠</span> Still to confirm: {missing.join(', ')}
            </p>
          ) : <span />}
          {isAdmin && (
            <Link href={`/bookings/${show.id}`} className="tour-card-cta today-show-cta">
              {missing.length > 0 ? 'Fill in day sheet →' : 'Open day sheet →'}
            </Link>
          )}
        </footer>
      )}
    </article>
  );
}

/** Off-day card: what's next, so the page is never a dead end. */
function OffDayCard({ next, today, tomorrowHasShow }: { next: NextShow | null; today: string; tomorrowHasShow: boolean }) {
  return (
    <article className="today-show today-show--off">
      <span className="today-eyebrow">Today</span>
      <h2 className="today-show-name">Off day</h2>
      {tomorrowHasShow ? (
        <p className="today-off-text">No show tonight — you’re back on stage tomorrow. Tomorrow’s sheet is below.</p>
      ) : next ? (
        <p className="today-off-text">
          No show tonight. Next up: <strong>{next.venue?.name || 'Venue TBD'}</strong>
          {cityLine(next.venue) ? ` in ${cityLine(next.venue)}` : ''} on{' '}
          {formatShowDate(next.show_date, { weekday: 'long', month: 'long', day: 'numeric' })}
          {' '}({daysBetween(today, next.show_date)} days out).
        </p>
      ) : (
        <p className="today-off-text">No show tonight and nothing booked ahead yet.</p>
      )}
    </article>
  );
}

/** Compact tomorrow card; the full sheet opens in place. */
function TomorrowCard({ show, isAdmin, dateLabel }: { show: DayShow; isAdmin: boolean; dateLabel: string }) {
  const where = cityLine(show.venue);
  const showtime = formatClock(show.set_time);
  const loadIn = formatClock(show.load_in_time);
  return (
    <article className="today-tomorrow" aria-labelledby={`tomorrow-${show.id}`}>
      <div className="today-tomorrow-head">
        <div className="today-show-title-block">
          <span className="today-eyebrow">Tomorrow · {dateLabel}</span>
          <h2 className="today-tomorrow-name" id={`tomorrow-${show.id}`}>{show.venue?.name || 'Venue TBD'}</h2>
          {where && <span className="today-show-where">{where}</span>}
        </div>
        <dl className="today-tomorrow-times">
          <div><dt>Load-in</dt><dd>{loadIn ?? 'TBD'}</dd></div>
          <div><dt>Showtime</dt><dd>{showtime ?? 'TBD'}</dd></div>
        </dl>
      </div>
      <details className="today-details">
        <summary>Full day sheet</summary>
        <div className="today-details-body">
          <RunOfShow booking={show} />
          <div className="today-show-grid">
            <WhereBlock booking={show} />
            <LogisticsBlock booking={show} />
          </div>
          <NotesBlocks booking={show} isAdmin={isAdmin} />
        </div>
      </details>
    </article>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────────

/** Renders a note's simple markup: [ ] / [x] checkboxes, bullets, numbered lines. */
function RenderNote({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="today-note-render">
      {text.split('\n').map((line, i) => {
        const cbDone = line.match(/^\[x\]\s*(.*)/i);
        const cbOpen = line.match(/^\[ \]\s*(.*)/);
        const bullet = line.match(/^[-*]\s+(.*)/);
        const numbered = line.match(/^(\d+)\.\s+(.*)/);
        if (cbDone) return <div key={i} className="today-note-line today-note-line--done"><span aria-hidden="true">✓</span><s>{cbDone[1]}</s></div>;
        if (cbOpen) return <div key={i} className="today-note-line"><span className="today-note-box" aria-hidden="true" /><span>{cbOpen[1]}</span></div>;
        if (bullet) return <div key={i} className="today-note-line"><span className="today-note-mark" aria-hidden="true">·</span><span>{bullet[1]}</span></div>;
        if (numbered) return <div key={i} className="today-note-line"><span className="today-note-mark">{numbered[1]}.</span><span>{numbered[2]}</span></div>;
        if (line === '') return <div key={i} className="today-note-gap" />;
        return <div key={i} className="today-note-line"><span>{line}</span></div>;
      })}
    </div>
  );
}

const VIS_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'admin_only', label: 'Only me' },
  { value: 'band_admin', label: 'Band admin' },
  { value: 'all_members', label: 'Whole band' },
];

interface NotesPanelProps {
  userId: string;
  actId: string | null;
  tourId: string | null;
  tourName: string | null;
  todayStr: string;
  token: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Today's note for the signed-in user: autosaves, with visibility and a past-notes browser. */
function NotesPanel({ userId, actId, tourId, tourName, todayStr, token }: NotesPanelProps) {
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('admin_only');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showPast, setShowPast] = useState(false);

  const contentRef = useRef('');
  const visibilityRef = useRef<Visibility>('admin_only');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (savedResetTimer.current) clearTimeout(savedResetTimer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/notes?date=${todayStr}&view=day`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { console.error('[today] note load failed', res.status); return; }
        const { notes } = (await res.json()) as { notes: DailyNote[] };
        const mine = notes.find(n => n.user_id === userId);
        if (cancelled || !mine) return;
        contentRef.current = mine.content ?? '';
        visibilityRef.current = mine.visibility ?? 'admin_only';
        setContent(mine.content ?? '');
        setVisibility(mine.visibility ?? 'admin_only');
      } catch (err) {
        console.error('[today] note load threw', err);
      }
    })();
    return () => { cancelled = true; };
  }, [todayStr, token, userId]);

  const triggerSave = useCallback(async (): Promise<void> => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: contentRef.current,
          note_date: todayStr,
          tour_id: tourId ?? null,
          act_id: actId ?? null,
          visibility: visibilityRef.current,
        }),
      });
      if (!res.ok) { console.error('[today] note save failed', res.status); setSaveStatus('error'); return; }
      setSaveStatus('saved');
      if (savedResetTimer.current) clearTimeout(savedResetTimer.current);
      savedResetTimer.current = setTimeout(() => setSaveStatus(s => (s === 'saved' ? 'idle' : s)), 2000);
    } catch (err) {
      console.error('[today] note save threw', err);
      setSaveStatus('error');
    }
  }, [token, todayStr, tourId, actId]);

  const scheduleAutosave = (delayMs: number): void => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void triggerSave(); }, delayMs);
  };

  const handleChange = (val: string): void => {
    contentRef.current = val;
    setContent(val);
    setSaveStatus('idle');
    scheduleAutosave(2000);
  };

  const handleVisibility = (vis: Visibility): void => {
    visibilityRef.current = vis;
    setVisibility(vis);
    scheduleAutosave(500);
  };

  const statusText =
    saveStatus === 'saving' ? 'Saving…' :
    saveStatus === 'saved' ? 'Saved' :
    saveStatus === 'error' ? 'Couldn’t save — try again' :
    content ? 'Autosaves as you type' : '';

  return (
    <section className="today-notes" aria-labelledby="today-notes-title">
      <div className="today-notes-head">
        <h2 className="today-notes-title" id="today-notes-title">Notes</h2>
        {tourName && <span className="today-tour-chip">{tourName}</span>}
      </div>

      <div className="today-vis" role="group" aria-label="Who can see this note">
        {VIS_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`tours-tab today-vis-btn${visibility === value ? ' tours-tab--on' : ''}`}
            aria-pressed={visibility === value}
            onClick={() => handleVisibility(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="sr-only" htmlFor="today-note-text">Today’s note</label>
      <textarea
        id="today-note-text"
        className="textarea today-note-input"
        value={content}
        onChange={e => handleChange(e.target.value)}
        placeholder={'Write a note for today…\n- bullet points\n[ ] checklist items'}
      />

      <div className="today-notes-foot">
        <button type="button" className="today-link-btn" onClick={() => setShowPast(true)}>Past notes →</button>
        <span className={`today-save-status${saveStatus === 'error' ? ' today-save-status--error' : ''}`} role="status">{statusText}</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void triggerSave()} disabled={saveStatus === 'saving'}>
          {saveStatus === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>

      {showPast && <PastNotesDialog userId={userId} token={token} onClose={() => setShowPast(false)} />}
    </section>
  );
}

/** Browse earlier notes by date or by tour. */
function PastNotesDialog({ userId, token, onClose }: { userId: string; token: string; onClose: () => void }) {
  const [tab, setTab] = useState<'date' | 'tour'>('date');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dates, setDates] = useState<string[]>([]);
  const [tours, setTours] = useState<TourStub[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTour, setSelectedTour] = useState('');
  const [notes, setNotes] = useState<DailyNote[] | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Latest onClose without re-running the focus effect on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Focus the close button on open, close on Escape, hand focus back on close.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [datesRes, toursRes] = await Promise.all([
          fetch('/api/notes?view=dates', { headers: { Authorization: `Bearer ${token}` } }),
          supabase.from('tours').select('id, name, start_date, end_date')
            .neq('status', 'cancelled').order('start_date', { ascending: false }).limit(30),
        ]);
        if (cancelled) return;
        if (!datesRes.ok) throw new Error(`notes dates ${datesRes.status}`);
        const { dates: d } = (await datesRes.json()) as { dates: string[] | null };
        setDates(d ?? []);
        setTours((toursRes.data as TourStub[] | null) ?? []);
      } catch (err) {
        console.error('[today] past notes load failed', err);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const loadNotes = async (query: string): Promise<void> => {
    setNotes(null);
    try {
      const res = await fetch(`/api/notes?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`notes ${res.status}`);
      const { notes: n } = (await res.json()) as { notes: DailyNote[] | null };
      setNotes(n ?? []);
    } catch (err) {
      console.error('[today] past notes fetch failed', err);
      setNotes([]);
      setFailed(true);
    }
  };

  const pickDate = (d: string): void => { setSelectedDate(d); void loadNotes(`date=${d}&view=day`); };
  const pickTour = (id: string): void => { setSelectedTour(id); if (id) void loadNotes(`tour_id=${id}&view=tour`); else setNotes(null); };
  const author = (n: DailyNote): string => {
    const name = n.author?.display_name || n.author?.email || 'Unknown';
    return n.user_id === userId ? `${name} (you)` : name;
  };

  const noteList = (emptyText: string, withDates: boolean) => (
    notes === null ? <p className="today-past-empty">Loading…</p>
      : notes.length === 0 ? <p className="today-past-empty">{emptyText}</p>
      : notes.map(n => (
        <article key={n.id} className="today-past-note">
          <header>
            {withDates && <span className="today-past-date">{formatShowDate(n.note_date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>}
            <span className={n.user_id === userId ? 'today-past-author today-past-author--me' : 'today-past-author'}>{author(n)}</span>
          </header>
          <RenderNote text={n.content} />
        </article>
      ))
  );

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal today-past" role="dialog" aria-modal="true" aria-labelledby="past-notes-title">
        <div className="modal-header">
          <h3 className="modal-title" id="past-notes-title">Past notes</h3>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="tours-tabs today-past-tabs" role="group" aria-label="Browse notes">
          {(['date', 'tour'] as const).map(t => (
            <button key={t} type="button" className={`tours-tab${tab === t ? ' tours-tab--on' : ''}`} aria-pressed={tab === t}
              onClick={() => { setTab(t); setNotes(null); setSelectedDate(null); setSelectedTour(''); }}>
              {t === 'date' ? 'By date' : 'By tour'}
            </button>
          ))}
        </div>
        {failed && <p className="tours-form-error" role="alert">Some notes didn’t load. Close and try again.</p>}
        {loading ? <p className="today-past-empty">Loading…</p> : tab === 'date' ? (
          <div className="today-past-split">
            <ul className="today-past-dates" aria-label="Dates with notes">
              {dates.length === 0 && <li className="today-past-empty">No notes yet.</li>}
              {dates.map(d => (
                <li key={d}>
                  <button type="button" className={`today-past-date-btn${selectedDate === d ? ' today-past-date-btn--on' : ''}`}
                    aria-pressed={selectedDate === d} onClick={() => pickDate(d)}>
                    {formatShowDate(d, { month: 'short', day: 'numeric', year: '2-digit' })}
                  </button>
                </li>
              ))}
            </ul>
            <div className="today-past-body">
              {selectedDate ? noteList('No notes for this date.', false) : <p className="today-past-empty">Pick a date.</p>}
            </div>
          </div>
        ) : (
          <div className="today-past-body">
            <label className="field-label" htmlFor="past-tour">Tour</label>
            <select id="past-tour" className="select" value={selectedTour} onChange={e => pickTour(e.target.value)}>
              <option value="">Select a tour…</option>
              {tours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {selectedTour && noteList('No notes written during this tour.', true)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TodayPage() {
  // The browser's local calendar day, not UTC: toISOString() rolls over to
  // "tomorrow" every US evening. Read after mount so the server render (UTC
  // clock) and the browser render can't disagree during hydration.
  const [todayStr, setTodayStr] = useState<string | null>(null);
  const tomorrowStr = todayStr ? addDays(todayStr, 1) : null;
  const [result, setResult] = useState<LoadResult | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // The day is re-read on every (re)load, so "Try again" after midnight moves on to the new day.
  useEffect(() => {
    const td = localToday();
    let cancelled = false;
    void loadToday(td, addDays(td, 1)).then(r => {
      if (cancelled) return;
      setTodayStr(td);
      setResult(r);
    });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const retry = (): void => { setResult(null); setReloadKey(k => k + 1); };
  const longDate = (d: string): string => formatShowDate(d, { weekday: 'long', month: 'long', day: 'numeric' });

  const ok = result?.kind === 'ok' && todayStr && tomorrowStr ? result : null;
  const isAdmin = ok ? isAdminRole(ok.role) : false;
  const summary = ok
    ? heroSummary({ todayShows: ok.todayShows, tomorrowShows: ok.tomorrowShows, next: ok.next, today: todayStr ?? '' })
    : undefined;
  const firstToday = ok?.todayShows[0];

  return (
    <AppShell requireRole={['band_admin', 'member']}>
      <PageHero
        title="Today"
        subtitle={todayStr ? longDate(todayStr) : 'Show day'}
        summary={summary}
        scene={<ShowNightScene />}
        actions={isAdmin && firstToday ? (
          <Link href={`/bookings/${firstToday.id}`} className="btn btn-primary tours-new-btn">Tonight’s day sheet</Link>
        ) : undefined}
      />

      {result === null && (
        <div className="today-layout" aria-busy="true">
          <span className="sr-only" role="status">Loading today…</span>
          <div className="today-main">
            <div className="today-show tour-skeleton tour-skeleton--card today-skeleton-lg" />
            <div className="today-tomorrow tour-skeleton tour-skeleton--card" />
          </div>
          <div className="today-notes tour-skeleton tour-skeleton--card today-skeleton-lg" />
        </div>
      )}

      {result?.kind === 'error' && (
        <div className="card tours-empty" role="alert">
          <div className="tours-empty-title">Today didn’t load</div>
          <p>Something went wrong reaching the database. Your shows and notes are safe — try again.</p>
          <button type="button" className="btn btn-primary" onClick={retry}>Try again</button>
        </div>
      )}

      {result?.kind === 'signed-out' && (
        <div className="card tours-empty"><div className="tours-empty-title">Sign in to see today</div></div>
      )}

      {result?.kind === 'no-band' && todayStr && (
        <div className="today-layout">
          <div className="card tours-empty today-main">
            <div className="tours-empty-title">No band yet</div>
            <p>Once you’re on a band’s roster, show days land here with the run of show, directions and logistics.</p>
          </div>
          <NotesPanel userId={result.userId} actId={null} tourId={null} tourName={null} todayStr={todayStr} token={result.token} />
        </div>
      )}

      {ok && (
        <div className="today-layout">
          <div className="today-main">
            {ok.todayShows.length > 0
              ? ok.todayShows.map((s, i) => (
                <ShowCard key={s.id} show={s} isAdmin={isAdmin}
                  eyebrow={ok.todayShows.length > 1 ? `Tonight · show ${i + 1} of ${ok.todayShows.length}` : 'Tonight'} />
              ))
              : <OffDayCard next={ok.next} today={todayStr ?? ''} tomorrowHasShow={ok.tomorrowShows.length > 0} />}

            {ok.tomorrowShows.map(s => (
              <TomorrowCard key={s.id} show={s} isAdmin={isAdmin}
                dateLabel={formatShowDate(tomorrowStr ?? '', { weekday: 'short', month: 'short', day: 'numeric' })} />
            ))}
            {ok.tomorrowShows.length === 0 && ok.todayShows.length > 0 && (
              <p className="today-quiet">
                Nothing tomorrow.
                {ok.next && <> Next show: <strong>{ok.next.venue?.name || 'Venue TBD'}</strong> on {longDate(ok.next.show_date)}.</>}
              </p>
            )}
          </div>

          <NotesPanel
            userId={ok.userId}
            actId={ok.actId}
            tourId={ok.activeTour?.id ?? null}
            tourName={ok.activeTour?.name ?? null}
            todayStr={todayStr ?? ''}
            token={ok.token}
          />
        </div>
      )}
    </AppShell>
  );
}
