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

  // Accept either a single id or an array. Normalise to array.
  const { staged_action_id, staged_action_ids } = req.body;
  const ids: string[] = staged_action_ids
    ? Array.isArray(staged_action_ids) ? staged_action_ids : [staged_action_ids]
    : staged_action_id
    ? [staged_action_id]
    : [];
  if (ids.length === 0) return res.status(400).json({ error: 'staged_action_id or staged_action_ids required' });

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('act_id')
    .eq('id', user.id)
    .single();
  if (profileErr || !profile?.act_id) return res.status(403).json({ error: 'No active act for this user' });

  // Process each staged action. A single item failing does not abort the rest.
  // Note: these are sequential per-row writes, not one atomic transaction across tables —
  // a partial-batch failure is possible if e.g. one card expired.
  type ItemResult = { staged_action_id: string; success: boolean; data?: unknown; error?: string };
  const results: ItemResult[] = [];

  for (const id of ids) {
    try {
      const { data: staged, error: stagedErr } = await supabase
        .from('ai_staged_actions')
        .select('*')
        .eq('id', id)
        .eq('act_id', profile.act_id)
        .eq('status', 'pending')
        .maybeSingle();

      if (stagedErr) throw new Error(stagedErr.message);
      if (!staged) throw new Error('Proposal not found, already executed, or expired');
      if (new Date(staged.expires_at) < new Date()) {
        await supabase.from('ai_staged_actions').update({ status: 'expired' }).eq('id', staged.id);
        throw new Error('This proposal expired. Ask the assistant to try again.');
      }

      const p = staged.payload as any;
      let result: unknown;

      if (staged.action_type === 'booking_upsert') {
        if (p.booking_id) {
          const { data, error } = await supabase
            .from('bookings')
            .update({
              venue_id: p.venue_id ?? null,
              show_date: p.show_date,
              entry_type: p.entry_type ?? 'show',
              ...(p.tour_id !== undefined && { tour_id: p.tour_id }),
              ...(p.status !== undefined && { status: p.status }),
              ...(p.fee !== undefined && { fee: p.fee }),
              ...(p.deal_notes !== undefined && { deal_notes: p.deal_notes }),
              ...(p.load_in_time !== undefined && { load_in_time: p.load_in_time }),
              ...(p.soundcheck_time !== undefined && { soundcheck_time: p.soundcheck_time }),
              ...(p.set_time !== undefined && { set_time: p.set_time }),
              ...(p.end_time !== undefined && { end_time: p.end_time }),
              ...(p.venue_contact_name !== undefined && { venue_contact_name: p.venue_contact_name }),
              ...(p.sound_system !== undefined && { sound_system: p.sound_system }),
              ...(p.lodging_details !== undefined && { lodging_details: p.lodging_details }),
              ...(p.special_requirements !== undefined && { special_requirements: p.special_requirements }),
              ...(p.notes !== undefined && { notes: p.notes }),
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
              venue_id: p.venue_id ?? null,
              show_date: p.show_date,
              entry_type: p.entry_type ?? 'show',
              tour_id: p.tour_id ?? null,
              status: p.status ?? 'hold',
              fee: p.fee ?? null,
              deal_notes: p.deal_notes ?? null,
              load_in_time: p.load_in_time ?? null,
              soundcheck_time: p.soundcheck_time ?? null,
              set_time: p.set_time ?? null,
              end_time: p.end_time ?? null,
              venue_contact_name: p.venue_contact_name ?? null,
              sound_system: p.sound_system ?? null,
              lodging_details: p.lodging_details ?? null,
              special_requirements: p.special_requirements ?? null,
              notes: p.notes ?? null,
              source: 'ai_agent',
            })
            .select()
            .single();
          if (error) throw error;
          result = data;
        }
      } else if (staged.action_type === 'tour_notes_update') {
        const { data, error } = await supabase
          .from('tours')
          .update({ routing_notes: p.new_notes, updated_at: new Date().toISOString() })
          .eq('id', p.tour_id)
          .eq('act_id', profile.act_id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else if (staged.action_type === 'expense_insert') {
        const { data, error } = await supabase
          .from('expenses')
          .insert({
            user_id: user.id,
            act_id: profile.act_id,
            tour_id: p.tour_id,
            expense_date: p.expense_date,
            category: p.category,
            amount: p.amount,
            status: p.status ?? 'potential',
            notes: p.notes ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        throw new Error(`Unknown action_type: ${staged.action_type}`);
      }

      await supabase
        .from('ai_staged_actions')
        .update({ status: 'executed', executed_by: user.id, executed_at: new Date().toISOString(), result })
        .eq('id', staged.id);

      results.push({ staged_action_id: id, success: true, data: result });
    } catch (err: any) {
      console.error('Execute error for', id, err);
      results.push({ staged_action_id: id, success: false, error: err.message ?? 'Failed to execute' });
    }
  }

  // For single-item backwards compat, also include top-level booking/data field.
  const allOk = results.every((r) => r.success);
  if (ids.length === 1) {
    const r = results[0];
    if (r.success) {
      return res.status(200).json({ success: true, booking: r.data, data: r.data, results });
    } else {
      return res.status(500).json({ error: r.error, results });
    }
  }

  return res.status(allOk ? 200 : 207).json({ success: allOk, results });
}
