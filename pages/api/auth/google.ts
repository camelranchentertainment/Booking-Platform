import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthUrl } from '../../../lib/googleCalendar';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { email } = req.query;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const authUrl = getAuthUrl();
    
    // Add user email as state parameter
    const urlWithState = `${authUrl}&state=${encodeURIComponent(email)}`;
    
    res.redirect(urlWithState);
  } catch (error) {
    console.error('Auth URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
}
