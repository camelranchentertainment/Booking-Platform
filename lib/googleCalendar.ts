import { google } from 'googleapis';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ── OAuth2 client ─────────────────────────────────────────────────────────────

function makeOAuth2Client() {
  const redirectUri = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
    : 'http://localhost:3000/api/auth/google/callback';

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
}

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

// ── AES-256-CBC helpers ───────────────────────────────────────────────────────

export function encryptToken(text: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'utf8').slice(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptToken(encryptedText: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'utf8').slice(0, 32);
  const [ivHex, encHex] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ── Supabase (server-side) ────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Auth URL ──────────────────────────────────────────────────────────────────

export function getAuthUrl(userId: string): string {
  const client = makeOAuth2Client();
  const state = Buffer.from(userId).toString('base64url');
  return client.generateAuthUrl({
    access_type: 'offline',
    scope:       CALENDAR_SCOPES,
    prompt:      'consent',   // always request refresh_token
    state,
  });
}

// ── Token exchange (callback) ─────────────────────────────────────────────────

export async function exchangeCodeForTokens(code: string) {
  const client = makeOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

// ── Per-user authenticated OAuth2 client ─────────────────────────────────────

async function getAuthedClient(userId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('user_calendar_settings')
    .select('google_refresh_token')
    .eq('user_id', userId)
    .eq('calendar_type', 'google_oauth')
    .neq('is_active', false)
    .maybeSingle();

  if (error) throw error;
  if (!data?.google_refresh_token) {
    throw new Error('No Google Calendar connected. Connect it in Settings → Calendar.');
  }

  const refreshToken = decryptToken(data.google_refresh_token);
  const client = makeOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

// ── Read events ───────────────────────────────────────────────────────────────

export async function fetchGoogleOAuthEvents(userId: string, year: string) {
  const auth = await getAuthedClient(userId);
  const cal = google.calendar({ version: 'v3', auth });

  const { data } = await cal.events.list({
    calendarId:   'primary',
    timeMin:      `${year}-01-01T00:00:00Z`,
    timeMax:      `${year}-12-31T23:59:59Z`,
    singleEvents: true,
    orderBy:      'startTime',
    maxResults:   500,
  });

  return (data.items || []).map((e: any) => ({
    id:          e.id,
    title:       e.summary || 'Untitled',
    description: e.description,
    location:    e.location,
    date:        e.start?.date || e.start?.dateTime?.split('T')[0] || '',
    start_time:  e.start?.dateTime,
    end_time:    e.end?.dateTime,
  }));
}

// ── Create event ──────────────────────────────────────────────────────────────

export async function createCalendarEvent(userId: string, event: {
  summary:      string;
  description?: string;
  location?:    string;
  date:         string; // YYYY-MM-DD
}): Promise<string> {
  const auth = await getAuthedClient(userId);
  const cal = google.calendar({ version: 'v3', auth });

  const { data } = await cal.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary:     event.summary,
      description: event.description,
      location:    event.location,
      start: { date: event.date },
      end:   { date: event.date },
    },
  });

  return data.id!;
}

// ── Legacy helpers (kept for backwards compatibility) ─────────────────────────

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string };
  end:   { date?: string; dateTime?: string };
}

export async function listCalendars(accessToken: string, refreshToken?: string) {
  const client = makeOAuth2Client();
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: client });
  const response = await calendar.calendarList.list();
  return response.data.items || [];
}
