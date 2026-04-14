import { NextApiRequest, NextApiResponse } from 'next';
import { createCalendarEvent } from '../../../lib/googleCalendar';

// POST /api/calendar/create-event
// Body: { userId, summary, description?, location?, date (YYYY-MM-DD) }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, summary, description, location, date } = req.body;

  if (!userId || !summary || !date) {
    return res.status(400).json({ error: 'userId, summary, and date are required' });
  }

  try {
    const eventId = await createCalendarEvent(userId, { summary, description, location, date });
    return res.status(200).json({ success: true, eventId });
  } catch (err: unknown) {
    console.error('[calendar/create-event]', err);
    // Return a non-fatal 200 with an error flag so the venue save still completes
    return res.status(200).json({ success: false, error: err instanceof Error ? err.message : 'Calendar event creation failed' });
  }
}
