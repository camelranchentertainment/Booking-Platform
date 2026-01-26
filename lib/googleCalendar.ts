import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.NEXT_PUBLIC_BASE_URL 
    ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback`
    : 'http://localhost:3000/api/auth/google/callback'
);

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    date?: string;
    dateTime?: string;
  };
  end: {
    date?: string;
    dateTime?: string;
  };
}

// Get authorization URL
export function getAuthUrl() {
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
}

// Exchange code for tokens
export async function getTokens(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

// Set credentials
export function setCredentials(accessToken: string, refreshToken?: string) {
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken
  });
}

// Get list of user's calendars
export async function listCalendars(accessToken: string, refreshToken?: string) {
  setCredentials(accessToken, refreshToken);
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const response = await calendar.calendarList.list();
  
  return response.data.items || [];
}

// Create event in Google Calendar
export async function createEvent(
  calendarId: string,
  event: CalendarEvent,
  accessToken: string,
  refreshToken?: string
) {
  setCredentials(accessToken, refreshToken);
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  const response = await calendar.events.insert({
    calendarId,
    requestBody: event
  });
  
  return response.data;
}

// Update event in Google Calendar
export async function updateEvent(
  calendarId: string,
  eventId: string,
  event: CalendarEvent,
  accessToken: string,
  refreshToken?: string
) {
  setCredentials(accessToken, refreshToken);
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  const response = await calendar.events.update({
    calendarId,
    eventId,
    requestBody: event
  });
  
  return response.data;
}

// Delete event from Google Calendar
export async function deleteEvent(
  calendarId: string,
  eventId: string,
  accessToken: string,
  refreshToken?: string
) {
  setCredentials(accessToken, refreshToken);
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  await calendar.events.delete({
    calendarId,
    eventId
  });
}

// Get events from Google Calendar
export async function getEvents(
  calendarId: string,
  timeMin: string,
  timeMax: string,
  accessToken: string,
  refreshToken?: string
) {
  setCredentials(accessToken, refreshToken);
  
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  const response = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime'
  });
  
  return response.data.items || [];
}

// Refresh access token
export async function refreshAccessToken(refreshToken: string) {
  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });
  
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials.access_token;
}
