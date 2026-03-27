import { NextApiRequest, NextApiResponse } from 'next';
import { listCalendars } from '../../../lib/googleCalendar';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { accessToken, refreshToken } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: 'accessToken is required' });
  }

  try {
    const calendars = await listCalendars(accessToken, refreshToken);
    return res.status(200).json({ calendars });
  } catch (error) {
    console.error('Error listing Google Calendars:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch calendars',
    });
  }
}
