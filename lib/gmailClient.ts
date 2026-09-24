import { google } from 'googleapis';
import { getServiceClient } from './supabase';

export async function getGmailClient(actId: string) {
  if (!actId) {
    throw new Error('actId is required');
  }

  const service = getServiceClient();

  const [{ data: creds }, { data: actData }] = await Promise.all([
    service.from('act_credentials').select('google_access_token, google_refresh_token').eq('act_id', actId).maybeSingle(),
    service.from('acts').select('gmail_address').eq('id', actId).single(),
  ]);

  if (!creds?.google_refresh_token) {
    throw new Error('Gmail not connected for this act');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  oauth2Client.setCredentials({
    access_token: creds.google_access_token,
    refresh_token: creds.google_refresh_token,
  });

  // Save refreshed credentials back to act_credentials
  oauth2Client.on('tokens', async (newTokens) => {
    const updates: Record<string, string> = {};
    if (newTokens.access_token) updates.google_access_token = newTokens.access_token;
    if (newTokens.refresh_token) updates.google_refresh_token = newTokens.refresh_token;
    if (Object.keys(updates).length > 0) {
      await service.from('act_credentials').update(updates).eq('act_id', actId);
    }
  });

  const gmail = google.gmail({
    version: 'v1',
    auth: oauth2Client,
  });

  return {
    gmail,
    gmailAddress: actData?.gmail_address as string | null,
  };
}