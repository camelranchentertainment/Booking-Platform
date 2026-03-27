import { NextApiRequest, NextApiResponse } from 'next';
import { getAuthUrl } from '../../../../lib/googleCalendar';

// GET /api/auth/google?userId=<id>
// Redirects the user to Google's OAuth2 consent screen.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = req.query.userId as string | undefined;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({
      error: 'Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your environment.',
    });
  }

  const url = getAuthUrl(userId);
  res.redirect(url);
}
