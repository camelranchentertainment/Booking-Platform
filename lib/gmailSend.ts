import { google } from 'googleapis';
import { getServiceClient } from './supabase';

export async function sendViaGmail(
  actId:   string,
  to:      string,
  subject: string,
  body:    string,
): Promise<void> {
  if (!actId || !to || !subject || !body) {
    throw new Error('actId, to, subject, and body are all required');
  }

  const service = getServiceClient();
  const { data: act } = await service
    .from('acts')
    .select('google_access_token, google_refresh_token, gmail_address')
    .eq('id', actId)
    .single();

  if (!act?.google_refresh_token) {
    throw new Error('Gmail not connected for this act');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  oauth2Client.setCredentials({
    access_token:  act.google_access_token,
    refresh_token: act.google_refresh_token,
  });

  // Persist refreshed access token so the next call doesn't need to re-fetch
  oauth2Client.on('tokens', async (newTokens) => {
    if (newTokens.access_token) {
      await service
        .from('acts')
        .update({ google_access_token: newTokens.access_token })
        .eq('id', actId);
    }
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const messageParts = [
    `From: ${act.gmail_address}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ];

  const raw = Buffer.from(messageParts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId:      'me',
    requestBody: { raw },
  });
}
