import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' });
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

  const { staged_action_id } = req.body;
  if (!staged_action_id) return res.status(400).json({ error: 'staged_action_id required' });

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('act_id')
    .eq('id', user.id)
    .single();
  if (profileErr || !profile?.act_id) return res.status(403).json({ error: 'No active act for this user' });

  const { data: staged, error: stagedErr } = await supabase
    .from('ai_staged_actions')
    .select('*')
    .eq('id', staged_action_id)
    .eq('act_id', profile.act_id)
    .eq('status', 'pending')
    .maybeSingle();
  if (stagedErr) return res.status(500).json({ error: stagedErr.message });
  if (!staged) return res.status(404).json({ error: 'Proposal not found, already executed, or expired' });
  if (new Date(staged.expires_at) < new Date()) {
    await supabase.from('ai_staged_actions').update({ status: 'expired' }).eq('id', staged.id);
    return res.status(410).json({ error: 'This proposal expired. Ask the assistant to try again.' });
  }

  const p = staged.payload as any;

  try {
    let result;
    if (p.booking_id) {
      const { data, error } = await supabase
        .from('bookings')
        .update({
          venue_id: p.venue_id,
          show_date: p.show_date,
          ...(p.status !== undefined && { status: p.status }),
          ...(p.fee !== undefined && { fee: p.fee }),
          ...(p.deal_notes !== undefined && { deal_notes: p.deal_notes }),
          ...(p.load_in_time !== undefined && { load_in_time: p.load_in_time }),
          ...(p.set_time !== undefined && { set_time: p.set_time }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.booking_id)
        .eq('act_id', profile.act_id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          act_id: profile.act_id,
          created_by: user.id,
          venue_id: p.venue_id,
          show_date: p.show_date,
          status: p.status ?? 'hold',
          fee: p.fee ?? null,
          deal_notes: p.deal_notes ?? null,
          load_in_time: p.load_in_time ?? null,
          set_time: p.set_time ?? null,
          source: 'ai_agent',
        })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    await supabase
      .from('ai_staged_actions')
      .update({ status: 'executed', executed_by: user.id, executed_at: new Date().toISOString(), result })
      .eq('id', staged.id);

    return res.status(200).json({ success: true, booking: result });
  } catch (error: any) {
    console.error('Booking execute error:', error);
    return res.status(500).json({ error: error.message || 'Failed to save booking' });
  }
}
