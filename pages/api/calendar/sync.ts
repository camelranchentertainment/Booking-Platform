import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase';

interface GoogleCalendarEvent {
  id: string;
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, year } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Get user's calendar settings from database
    const { data: calendarSettings, error: settingsError } = await supabase
      .from('user_calendar_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching calendar settings:', settingsError);
      return res.status(500).json({ error: 'Failed to fetch calendar settings' });
    }

    if (!calendarSettings) {
      return res.status(200).json({ events: [], message: 'No calendar configured' });
    }

    let events: any[] = [];

    // Handle different calendar types
    if (calendarSettings.calendar_type === 'google' && calendarSettings.calendar_api_key) {
      events = await fetchGoogleCalendarEvents(
        calendarSettings.calendar_api_key,
        year as string
      );
    } else if (calendarSettings.calendar_type === 'ical' && calendarSettings.ical_url) {
      events = await fetchICalEvents(calendarSettings.ical_url, year as string);
    }

    // Update last_synced_at
    await supabase
      .from('user_calendar_settings')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', userId);

    return res.status(200).json({ events, synced_at: new Date().toISOString() });

  } catch (error) {
    console.error('Calendar sync error:', error);
    return res.status(500).json({ error: 'Failed to sync calendar' });
  }
}

async function fetchGoogleCalendarEvents(apiKey: string, year?: string): Promise<any[]> {
  try {
    const currentYear = year || new Date().getFullYear().toString();
    const timeMin = `${currentYear}-01-01T00:00:00Z`;
    const timeMax = `${currentYear}-12-31T23:59:59Z`;

    // Google Calendar API endpoint
    const calendarId = 'primary'; // or specific calendar ID
    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Google Calendar API error:', response.status, response.statusText);
      return [];
    }

    const data = await response.json();
    const items: GoogleCalendarEvent[] = data.items || [];

    // Transform to our format
    return items.map(event => ({
      id: event.id,
      title: event.summary || 'Untitled Event',
      description: event.description,
      location: event.location,
      date: event.start.date || event.start.dateTime?.split('T')[0],
      start_time: event.start.dateTime,
      end_time: event.end.dateTime,
      source: 'google_calendar',
      type: 'calendar_event'
    }));

  } catch (error) {
    console.error('Error fetching Google Calendar events:', error);
    return [];
  }
}

async function fetchICalEvents(icalUrl: string, year?: string): Promise<any[]> {
  try {
    const response = await fetch(icalUrl);
    
    if (!response.ok) {
      console.error('iCal fetch error:', response.status);
      return [];
    }

    const icalData = await response.text();
    
    // Parse iCal data (basic parsing)
    const events = parseICalData(icalData, year);
    
    return events.map(event => ({
      ...event,
      source: 'ical',
      type: 'calendar_event'
    }));

  } catch (error) {
    console.error('Error fetching iCal events:', error);
    return [];
  }
}

function parseICalData(icalData: string, year?: string): any[] {
  const events: any[] = [];
  const lines = icalData.split(/\r?\n/);
  
  let currentEvent: any = null;
  const targetYear = year || new Date().getFullYear().toString();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT' && currentEvent) {
      // Only include events from target year
      if (currentEvent.date && currentEvent.date.startsWith(targetYear)) {
        events.push(currentEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      if (line.startsWith('SUMMARY:')) {
        currentEvent.title = line.substring(8);
      } else if (line.startsWith('DESCRIPTION:')) {
        currentEvent.description = line.substring(12);
      } else if (line.startsWith('LOCATION:')) {
        currentEvent.location = line.substring(9);
      } else if (line.startsWith('DTSTART')) {
        const dateMatch = line.match(/DTSTART[;:](.+)/);
        if (dateMatch) {
          const dateStr = dateMatch[1];
          // Parse YYYYMMDD or YYYYMMDDTHHMMSS format
          if (dateStr.length >= 8) {
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            currentEvent.date = `${year}-${month}-${day}`;
          }
        }
      } else if (line.startsWith('UID:')) {
        currentEvent.id = line.substring(4);
      }
    }
  }

  return events;
}
