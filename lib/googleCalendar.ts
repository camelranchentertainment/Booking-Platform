import { getServiceClient } from './supabase';

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI  = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
  : 'https://camelranchbooking.com/api/auth/google/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri:  GOOGLE_REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = await res.json();
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expiry_date:   Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expiry_date: number;
}> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token:  refreshToken,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type:    'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return {
    access_token: data.access_token,
    expiry_date:  Date.now() + data.expires_in * 1000,
  };
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const service = getServiceClient();
  const { data: settings } = await service
    .from('user_calendar_settings')
    .select('google_access_token, google_refresh_token, google_token_expiry')
    .eq('user_id', userId)
    .maybeSingle();

  if (!settings?.google_refresh_token) return null;

  const expiry = settings.google_token_expiry
    ? new Date(settings.google_token_expiry).getTime()
    : 0;
  const bufferMs = 5 * 60 * 1000;

  if (settings.google_access_token && Date.now() < expiry - bufferMs) {
    return settings.google_access_token;
  }

  try {
    const { access_token, expiry_date } = await refreshAccessToken(settings.google_refresh_token);
    await service.from('user_calendar_settings').update({
      google_access_token:  access_token,
      google_token_expiry:  new Date(expiry_date).toISOString(),
    }).eq('user_id', userId);
    return access_token;
  } catch {
    return null;
  }
}

export async function listCalendars(accessToken: string): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Calendar list failed: ${await res.text()}`);
  const data = await res.json();
  return (data.items || []).map((c: any) => ({
    id:      c.id,
    summary: c.summary,
    primary: c.primary || false,
  }));
}

export async function createOrUpdateEvent(
  accessToken: string,
  calendarId: string,
  event: {
    summary: string;
    location?: string;
    description?: string;
    start: string;
    end: string;
  },
  googleEventId?: string,
): Promise<string> {
  const body = {
    summary:     event.summary,
    location:    event.location,
    description: event.description,
    start: { date: event.start },
    end:   { date: event.end },
  };

  let res: Response;
  if (googleEventId) {
    res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
  } else {
    res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
  }

  if (!res.ok) throw new Error(`Calendar event upsert failed: ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

export async function deleteEvent(accessToken: string, calendarId: string, googleEventId: string): Promise<void> {
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
  );
}
