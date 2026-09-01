import { google } from 'googleapis';
import { getServiceClient } from './supabase';

export async function getGmailClient(actId: string) {
  if (!actId) {
    throw new Error('actId is required');
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
    access_token: act.google_access_token,
    refresh_token: act.google_refresh_token,
  });

  // Save refreshed Google credentials for future Gmail requests
  oauth2Client.on('tokens', async (newTokens) => {
    const updates: Record<string, string> = {};

    if (newTokens.access_token) {
      updates.google_access_token = newTokens.access_token;
    }

    if (newTokens.refresh_token) {
      updates.google_refresh_token = newTokens.refresh_token;
    }

    if (Object.keys(updates).length > 0) {
      await service
        .from('acts')
        .update(updates)
        .eq('id', actId);
    }
  });

  const gmail = google.gmail({
    version: 'v1',
    auth: oauth2Client,
  });

  return {
    gmail,
    gmailAddress: act.gmail_address as string | null,
  };
}