import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase';
import { fetchGoogleOAuthEvents } from '../../../lib/googleCalendar';

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string };
  end:   { date?: string; dateTime?: string };
}

interface ParsedEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  date: string;
  start_time?: string;
  end_time?: string;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const targetYear = (req.query.year as string) || new Date().getFullYear().toString();

    // Prefer authenticated user from Bearer token; fall back to query param
    let userId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) userId = user.id;
    }
    if (!userId) {
      userId = req.query.userId as string | undefined;
    }

    console.log(`[calendar/sync] userId=${userId ?? 'none'} year=${targetYear} auth=${!!authHeader}`);

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // BUG FIX: use .neq('is_active', false) instead of .eq('is_active', true).
    // Rows with is_active = null (newly created) would be excluded by the strict
    // equality check, making the calendar appear unconfigured even when it is set.
    const { data: calendarSettings, error: settingsError } = await supabase
      .from('user_calendar_settings')
      .select('*')
      .eq('user_id', userId)
      .neq('is_active', false)
      .maybeSingle();

    console.log(`[calendar/sync] settings=${calendarSettings ? 'found' : 'none'} error=${settingsError?.message ?? 'none'}`);

    if (settingsError) {
      console.error('[calendar/sync] Error fetching settings:', settingsError);
      return res.status(500).json({ error: 'Failed to fetch calendar settings' });
    }

    if (!calendarSettings) {
      console.log('[calendar/sync] No active calendar settings for this user');
      return res.status(200).json({ events: [], message: 'No calendar configured' });
    }

    console.log(`[calendar/sync] type=${calendarSettings.calendar_type} ical_url=${calendarSettings.ical_url ?? 'none'}`);

    let events: ParsedEvent[] = [];

    if (calendarSettings.calendar_type === 'google_oauth') {
      // OAuth-connected Google Calendar — uses encrypted refresh token
      try {
        events = await fetchGoogleOAuthEvents(userId, targetYear);
      } catch (err: any) {
        console.error('[calendar/sync] Google OAuth fetch failed:', err.message);
        return res.status(200).json({ events: [], message: err.message });
      }
    } else if (calendarSettings.calendar_type === 'google' && calendarSettings.calendar_api_key) {
      events = await fetchGoogleCalendarEvents(calendarSettings.calendar_api_key, targetYear);
    } else if (calendarSettings.calendar_type === 'ical' && calendarSettings.ical_url) {
      events = await fetchICalEvents(calendarSettings.ical_url, targetYear);
    } else {
      console.log(`[calendar/sync] No matching handler for type="${calendarSettings.calendar_type}" — check credentials`);
    }

    console.log(`[calendar/sync] returning ${events.length} events`);

    // Update last_synced_at
    await supabase
      .from('user_calendar_settings')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', userId);

    return res.status(200).json({ events, synced_at: new Date().toISOString() });

  } catch (error) {
    console.error('[calendar/sync] Unhandled error:', error);
    return res.status(500).json({ error: 'Failed to sync calendar' });
  }
}

// ── Google Calendar ───────────────────────────────────────────────────────────

async function fetchGoogleCalendarEvents(apiKey: string, year: string): Promise<ParsedEvent[]> {
  try {
    const timeMin    = `${year}-01-01T00:00:00Z`;
    const timeMax    = `${year}-12-31T23:59:59Z`;
    const calendarId = 'primary';
    const url        = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
      `?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

    console.log(`[calendar/sync] Fetching Google Calendar year=${year}`);
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[calendar/sync] Google Calendar API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const items: GoogleCalendarEvent[] = data.items || [];
    console.log(`[calendar/sync] Google returned ${items.length} items`);

    return items.map(event => ({
      id:          event.id,
      title:       event.summary || 'Untitled Event',
      description: event.description,
      location:    event.location,
      date:        event.start.date || event.start.dateTime?.split('T')[0] || '',
      start_time:  event.start.dateTime,
      end_time:    event.end.dateTime,
    }));

  } catch (error) {
    console.error('[calendar/sync] Error fetching Google Calendar:', error);
    return [];
  }
}

// ── iCal ─────────────────────────────────────────────────────────────────────

async function fetchICalEvents(icalUrl: string, year: string): Promise<ParsedEvent[]> {
  try {
    console.log(`[calendar/sync] Fetching iCal from ${icalUrl}`);

    // BUG FIX: many CalDAV/iCal servers (Google, Apple, Fastmail) return 403
    // or a login-redirect HTML page for requests with no User-Agent header.
    const response = await fetch(icalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CalendarSync/1.0)',
        'Accept':     'text/calendar, */*',
      },
    });

    if (!response.ok) {
      console.error(`[calendar/sync] iCal fetch error: ${response.status} ${response.statusText}`);
      return [];
    }

    const icalData = await response.text();
    console.log(`[calendar/sync] iCal raw data: ${icalData.length} chars`);

    const allEvents = parseICalData(icalData);
    console.log(`[calendar/sync] Parsed ${allEvents.length} total events`);

    // Year filter applied here (not inside the parser) so the parser is reusable
    const filtered = allEvents.filter(e => e.date?.startsWith(year));
    console.log(`[calendar/sync] ${filtered.length} events match year ${year} (others: ${allEvents.length - filtered.length})`);

    return filtered.map(event => ({
      ...event,
      source: 'ical',
      type:   'calendar_event',
    } as ParsedEvent & { source: string; type: string }));

  } catch (error) {
    console.error('[calendar/sync] Error fetching iCal events:', error);
    return [];
  }
}

// ── iCal value helpers ────────────────────────────────────────────────────────

function unescapeICalValue(value: string): string {
  // BUG FIX: unescape RFC 5545 text escapes that were passed through raw before
  return value
    .replace(/\\n/g,  '\n')
    .replace(/\\,/g,  ',')
    .replace(/\\;/g,  ';')
    .replace(/\\\\/g, '\\');
}

// Parse a raw DTSTART/DTEND value (after the colon) into a date + optional time.
// Handles:
//   DATE:        20260315
//   DATE-TIME:   20260315T140000  or  20260315T140000Z
//   With params: TZID=America/Chicago:20260315T140000  (value after last colon)
function parseICalDateTime(raw: string): { date: string; time?: string } | null {
  // When DTSTART has parameters the full property line is e.g.
  // "DTSTART;TZID=America/Chicago:20260315T140000"
  // After we split at the first colon in the outer parser we get
  // raw = "20260315T140000" — but if the value itself contains a colon
  // (VTIMEZONE can have VALUE=DATE-TIME:...), take the last segment.
  const val = raw.includes(':') ? raw.split(':').pop()! : raw;

  if (val.length < 8) return null;

  const yr  = val.substring(0, 4);
  const mo  = val.substring(4, 6);
  const dy  = val.substring(6, 8);

  // Validate it actually looks like digits before building date string
  if (!/^\d{4}$/.test(yr) || !/^\d{2}$/.test(mo) || !/^\d{2}$/.test(dy)) {
    return null;
  }

  const date = `${yr}-${mo}-${dy}`;

  // DATE-TIME format: YYYYMMDDTHHMMSS[Z]
  if (val.length >= 15 && val.charAt(8) === 'T') {
    const hh = val.substring(9, 11);
    const mm = val.substring(11, 13);
    if (/^\d{2}$/.test(hh) && /^\d{2}$/.test(mm)) {
      return { date, time: `${hh}:${mm}` };
    }
  }

  return { date };
}

// ── iCal parser ───────────────────────────────────────────────────────────────

export function parseICalData(icalData: string): ParsedEvent[] {
  // ── 1. Unfold lines (RFC 5545 §3.1) ─────────────────────────────────────
  // Long property values are split across lines: the continuation line begins
  // with a single SPACE or HTAB character.  Naïvely splitting on \r?\n then
  // .trim()-ing every line silently truncates multi-line SUMMARY/DESCRIPTION
  // values AND breaks DTSTART if it ever gets folded.
  const rawLines = icalData.split(/\r?\n/);
  const lines: string[] = [];
  for (const raw of rawLines) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) {
      // Append continuation (strip the single fold character)
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }

  // ── 2. Parse VEVENT blocks ───────────────────────────────────────────────
  const events: ParsedEvent[] = [];
  let current: Partial<ParsedEvent> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd(); // keep leading chars (already unfolded above)
    if (!line) continue;

    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      // Only push if we at least got a parseable date
      if (current?.date) {
        events.push({
          id:          current.id          ?? `ical-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title:       current.title       ?? 'Untitled Event',
          description: current.description,
          location:    current.location,
          date:        current.date,
          start_time:  current.start_time,
          end_time:    current.end_time,
        });
      }
      current = null;
      continue;
    }

    if (!current) continue;

    // Split at the FIRST colon to separate "PROPNAME[;params]" from "value"
    // BUG FIX: the old code used a regex that matched the ; in DTSTART;TZID=...
    // causing the capture group to include the param string instead of the value.
    // Now we split on the first colon (params are never before the first colon).
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const propFull = line.substring(0, colonIdx);           // e.g. "DTSTART;TZID=America/Chicago"
    const value    = line.substring(colonIdx + 1);           // e.g. "20260315T140000"
    const propName = propFull.split(';')[0].toUpperCase();  // e.g. "DTSTART"

    switch (propName) {
      case 'UID':
        current.id = value;
        break;

      case 'SUMMARY':
        current.title = unescapeICalValue(value);
        break;

      case 'DESCRIPTION':
        current.description = unescapeICalValue(value);
        break;

      case 'LOCATION':
        current.location = unescapeICalValue(value);
        break;

      case 'DTSTART': {
        const parsed = parseICalDateTime(value);
        if (parsed) {
          current.date = parsed.date;
          if (parsed.time) current.start_time = `${parsed.date}T${parsed.time}`;
        } else {
          console.warn(`[calendar/sync] Could not parse DTSTART value: "${value}"`);
        }
        break;
      }

      case 'DTEND': {
        const parsed = parseICalDateTime(value);
        if (parsed?.time) current.end_time = `${parsed.date}T${parsed.time}`;
        break;
      }
    }
  }

  return events;
}
