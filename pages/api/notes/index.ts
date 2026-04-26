import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

type Visibility = 'agent_only' | 'band_admin' | 'all_members';

async function getAuthedUser(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const svc = getServiceClient();
  const { data: { user } } = await svc.auth.getUser(token);
  return user ?? null;
}

// Returns a Supabase OR-filter string covering all notes visible to this user.
// The service client bypasses RLS, so we enforce visibility manually here.
function buildVisibilityOr(userId: string, role: string, actId: string | null): string {
  const parts: string[] = [`user_id.eq.${userId}`];
  if (actId) {
    if (role === 'act_admin' || role === 'superadmin') {
      parts.push(`and(visibility.eq.band_admin,act_id.eq.${actId})`);
      parts.push(`and(visibility.eq.all_members,act_id.eq.${actId})`);
    } else if (role === 'member') {
      parts.push(`and(visibility.eq.all_members,act_id.eq.${actId})`);
    }
  }
  return parts.join(',');
}

async function enrichWithAuthors(
  svc: ReturnType<typeof getServiceClient>,
  notes: any[],
): Promise<any[]> {
  if (!notes.length) return notes;
  const ids = [...new Set(notes.map((n) => n.user_id))];
  const { data: profiles } = await svc
    .from('user_profiles')
    .select('id, display_name, email')
    .in('id', ids);
  const byId: Record<string, any> = Object.fromEntries(
    (profiles || []).map((p) => [p.id, p]),
  );
  return notes.map((n) => ({ ...n, author: byId[n.user_id] ?? null }));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const svc = getServiceClient();

  // Resolve profile (role + act_id)
  const { data: profile } = await svc
    .from('user_profiles')
    .select('role, act_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return res.status(401).json({ error: 'Profile not found' });

  // Resolve act_id for act_admin users who own (not link) their act
  let userActId: string | null = profile.act_id;
  if (!userActId && (profile.role === 'act_admin' || profile.role === 'superadmin')) {
    const { data: owned } = await svc
      .from('acts')
      .select('id')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    userActId = owned?.id ?? null;
  }

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { date, tour_id, view } = req.query;

    // view=dates → return all dates where this user has notes
    if (view === 'dates') {
      const { data } = await svc
        .from('daily_notes')
        .select('note_date')
        .eq('user_id', user.id)
        .order('note_date', { ascending: false });
      const dates = [...new Set((data || []).map((n: any) => n.note_date as string))];
      return res.json({ dates });
    }

    // view=tour → all notes for a tour visible to this user
    if (view === 'tour' && tour_id) {
      const orFilter = buildVisibilityOr(user.id, profile.role, userActId);
      const { data, error } = await svc
        .from('daily_notes')
        .select('*')
        .eq('tour_id', tour_id as string)
        .or(orFilter)
        .order('note_date', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ notes: await enrichWithAuthors(svc, data || []) });
    }

    // view=day (default) → notes for a specific date visible to this user
    if (date) {
      const orFilter = buildVisibilityOr(user.id, profile.role, userActId);
      const { data, error } = await svc
        .from('daily_notes')
        .select('*')
        .eq('note_date', date as string)
        .or(orFilter)
        .order('created_at', { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ notes: await enrichWithAuthors(svc, data || []) });
    }

    return res.status(400).json({ error: 'Provide date, tour_id, or view=dates' });
  }

  // ── POST — upsert today's note ───────────────────────────────────────────────
  if (req.method === 'POST') {
    const { content, note_date, tour_id, act_id, visibility } = req.body as {
      content?: string;
      note_date?: string;
      tour_id?: string | null;
      act_id?: string | null;
      visibility?: Visibility;
    };

    if (!note_date) return res.status(400).json({ error: 'note_date required' });

    const vis: Visibility = visibility || 'agent_only';
    if (!['agent_only', 'band_admin', 'all_members'].includes(vis)) {
      return res.status(400).json({ error: 'Invalid visibility' });
    }

    const { data, error } = await svc
      .from('daily_notes')
      .upsert(
        {
          user_id:    user.id,
          note_date,
          content:    content ?? '',
          tour_id:    tour_id  ?? null,
          act_id:     act_id   ?? userActId ?? null,
          visibility: vis,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,note_date' },
      )
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ note: data });
  }

  return res.status(405).end();
}
