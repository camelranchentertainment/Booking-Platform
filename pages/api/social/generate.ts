// pages/api/social/generate.ts
//
// Server-side proxy for Anthropic API calls made by SocialMediaCampaign.
// Keeps ANTHROPIC_API_KEY out of the browser bundle.

import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Anthropic API key not configured' });
  }

  const { venue, city, state, showDate, campaign } = req.body;

  if (!venue || !city || !state) {
    return res.status(400).json({ error: 'venue, city, and state are required' });
  }

  const prompt = `Create a social media campaign for a country/honky-tonk band called "Better Than Nothin'" (website: www.betterthannothin.com) performing at ${venue} in ${city}, ${state}${showDate ? ` on ${showDate}` : ''}${campaign ? ` as part of the "${campaign}" run` : ''}.

Generate exactly 6 posts — 2 Facebook, 2 Instagram, 2 Twitter/X — timed as: announcement (14 days before), hype post (3 days before), day-of post.

Return ONLY a valid JSON array, no markdown, no explanation:
[
  {
    "platform": "facebook",
    "timing": "announcement",
    "days_before": 14,
    "post_text": "Post text with emojis",
    "hashtags": ["#BetterThanNothin", "#CountryMusic", "#${city.replace(/\s/g, '')}"],
    "mentions": [],
    "image_prompt": "Short description for a show poster image"
  }
]`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 2000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.json().catch(() => ({}));
      console.error('Anthropic API error:', anthropicRes.status, errBody);
      return res.status(502).json({ error: 'Failed to reach Anthropic API', details: errBody });
    }

    const data = await anthropicRes.json();
    const raw  = (data.content?.[0]?.text || '').trim().replace(/```json\n?|```\n?/g, '').trim();

    let posts: unknown[];
    try {
      posts = JSON.parse(raw);
    } catch {
      console.error('Failed to parse Anthropic response as JSON:', raw);
      return res.status(502).json({ error: 'Invalid response from Anthropic API' });
    }

    return res.status(200).json({ posts });
  } catch (err: unknown) {
    console.error('Social generate error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Generation failed' });
  }
}
