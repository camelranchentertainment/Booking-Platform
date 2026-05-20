import { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '../../lib/supabase';
import { getSetting } from '../../lib/platformSettings';

const SYSTEM_PROMPT = `You are a music booking agent assistant for Camel Ranch Entertainment.
You help booking agents manage their pipeline, draft outreach, and plan tours.

You have real-time context about the agent's current acts, bookings, and tour pipeline provided below.
Be concise and direct — music industry voice, no corporate filler.
When referencing shows or venues, use the specific details from the context.
Max 3 short paragraphs per response.`;

async function buildContext(service: ReturnType<typeof getServiceClient>, actId: string): Promise<string> {
  const today = new Date().toISOString().split('T')[0];

  const [actRes, bookingsRes, toursRes] = await Promise.all([
    service.from('acts').select('act_name, genre, bio').eq('id', actId).single(),
    service.from('bookings')
      .select('status, show_date, venue:venues(name, city, state)')
      .eq('act_id', actId)
      .neq('status', 'cancelled')
      .order('show_date')
      .limit(30),
    service.from('tours')
      .select('name, status, start_date, end_date')
      .eq('act_id', actId)
      .neq('status', 'cancelled')
      .limit(5),
  ]);

  const act = actRes.data;
  const bookings = bookingsRes.data || [];
  const tours = toursRes.data || [];

  const upcoming = bookings
    .filter((b: any) => ['confirmed', 'advancing'].includes(b.status) && b.show_date && b.show_date >= today)
    .slice(0, 6);
  const inPipeline = bookings.filter((b: any) => ['pitch', 'negotiation', 'hold'].includes(b.status));
  const confirmed = bookings.filter((b: any) => b.status === 'confirmed' && b.show_date && b.show_date >= today);

  const lines = [
    `Act: ${act?.act_name}${act?.genre ? ` (${act.genre})` : ''}`,
    `Today: ${today}`,
    '',
    `Upcoming confirmed shows (${confirmed.length}):`,
    ...upcoming.map((b: any) => `  - ${b.show_date}: ${b.venue?.name || 'TBD'}${b.venue?.city ? `, ${b.venue.city}, ${b.venue.state}` : ''}`),
    '',
    `Pipeline (${inPipeline.length} venues being pitched/negotiated):`,
    ...inPipeline.slice(0, 5).map((b: any) => `  - ${b.venue?.name || 'TBD'}${b.venue?.city ? `, ${b.venue.city}` : ''} [${b.status}]`),
    '',
    `Tours (${tours.length}):`,
    ...tours.map((t: any) => `  - ${t.name} (${t.status})${t.start_date ? `: ${t.start_date}${t.end_date ? ` to ${t.end_date}` : ''}` : ''}`),
  ];

  return lines.join('\n');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { message, history = [], saveNote } = req.body as {
    message: string;
    history: Anthropic.MessageParam[];
    saveNote?: boolean;
  };
  if (!message) return res.status(400).json({ error: 'message required' });

  const service = getServiceClient();

  const { data: profile } = await service.from('user_profiles').select('act_id').eq('id', user.id).single();
  let actId: string | null = profile?.act_id ?? null;
  if (!actId) {
    const { data: owned } = await service.from('acts').select('id').eq('owner_id', user.id).eq('is_active', true).limit(1).maybeSingle();
    actId = owned?.id ?? null;
  }
  if (!actId) return res.status(400).json({ error: 'No act found' });

  const anthropicKey = await getSetting('anthropic_api_key');
  if (!anthropicKey) return res.status(500).json({ error: 'AI not configured. Add your Anthropic API key in Settings.' });

  const context = await buildContext(service, actId);
  const client = new Anthropic({ apiKey: anthropicKey });

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: message },
  ];

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `Current pipeline context:\n\n${context}` },
      ],
      messages,
    });

    const reply = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';

    if (saveNote && reply) {
      const today = new Date().toISOString().split('T')[0];
      const thread = [
        ...history.map((m: any) => `${m.role === 'user' ? 'Q' : 'A'}: ${typeof m.content === 'string' ? m.content : ''}`),
        `Q: ${message}`,
        `A: ${reply}`,
      ].join('\n');
      await service.from('daily_notes').upsert(
        { user_id: user.id, note_date: today, content: thread, act_id: actId, visibility: 'agent_only', updated_at: new Date().toISOString() },
        { onConflict: 'user_id,note_date' },
      );
    }

    return res.status(200).json({ reply });
  } catch (err: any) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Rate limited — try again shortly' });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `AI error: ${err.message}` });
    return res.status(500).json({ error: err.message });
  }
}
