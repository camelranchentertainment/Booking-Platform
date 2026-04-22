import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

async function postToDiscord(webhookUrl: string, content: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Discord error ${res.status}: ${text}` };
  }
  return { ok: true };
}

async function postToFacebook(pageId: string, pageAccessToken: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: pageAccessToken }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    return { ok: false, error: data.error?.message || `Facebook error ${res.status}` };
  }
  return { ok: true };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { postId } = req.body;
  if (!postId) return res.status(400).json({ error: 'postId required' });

  // Load post and verify ownership
  const { data: post } = await service
    .from('social_queue')
    .select('*, act:acts(id, agent_id, owner_id)')
    .eq('id', postId)
    .maybeSingle();

  if (!post) return res.status(404).json({ error: 'Post not found' });

  const act = post.act as any;
  if (act.agent_id !== user.id && act.owner_id !== user.id)
    return res.status(403).json({ error: 'Forbidden' });

  if (post.status !== 'approved')
    return res.status(400).json({ error: 'Post must be approved before publishing' });

  // Load social account credentials for this act + platform
  const { data: account } = await service
    .from('social_accounts')
    .select('credentials')
    .eq('act_id', post.act_id)
    .eq('platform', post.platform)
    .maybeSingle();

  if (!account) {
    return res.status(400).json({ error: `No ${post.platform} account connected for this act` });
  }

  const creds = account.credentials as any;
  let result: { ok: boolean; error?: string };

  switch (post.platform) {
    case 'discord': {
      if (!creds.webhook_url) return res.status(400).json({ error: 'Discord webhook URL not configured' });
      result = await postToDiscord(creds.webhook_url, post.content);
      break;
    }
    case 'facebook': {
      if (!creds.page_id || !creds.page_access_token)
        return res.status(400).json({ error: 'Facebook page ID and access token required' });
      result = await postToFacebook(creds.page_id, creds.page_access_token, post.content);
      break;
    }
    default:
      return res.status(400).json({ error: `Auto-posting not supported for ${post.platform}. Use copy to clipboard.` });
  }

  if (!result.ok) return res.status(502).json({ error: result.error });

  // Mark as posted
  await service.from('social_queue').update({ status: 'posted' }).eq('id', postId);

  return res.status(200).json({ ok: true });
}
