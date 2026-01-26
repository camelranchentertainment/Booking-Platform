import type { NextApiRequest, NextApiResponse } from 'next';
import { listCalendars } from '../../../lib/googleCalendar';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { accessToken, refreshToken } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: 'Access token required' });
  }

  try {
    const calendars = await listCalendars(accessToken, refreshToken);
    res.status(200).json({ calendars });
  } catch (error) {
    console.error('Error listing calendars:', error);
    res.status(500).json({ error: 'Failed to list calendars' });
  }
}
