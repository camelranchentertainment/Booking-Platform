import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = new Date();
  let processed = 0;
  let errors    = 0;

  const { data: rules } = await supabase
    .from('followup_rules')
    .select('id, act_id, first_followup_days, second_followup_days, max_followups, enabled')
    .eq('enabled', true);

  for (const rule of rules ?? []) {
    const firstCutoff  = new Date(now.getTime() - rule.first_followup_days  * 86_400_000);
    const secondCutoff = new Date(now.getTime() - rule.second_followup_days * 86_400_000);

    // Find qualifying tour_venues
    const { data: tvs } = await supabase
      .from('tour_venues')
      .select('id, venue_id, tour_id, last_contacted_at, venue:venues(name, email, city, state)')
      .eq('status', 'reached_out')
      .lte('last_contacted_at', firstCutoff.toISOString())
      .eq('tours.act_id' as any, rule.act_id);

    for (const tv of tvs ?? []) {
      try {
        // Check for existing queued follow-ups
        const { data: existing } = await supabase
          .from('followup_queue')
          .select('id, followup_number, sent_at')
          .eq('tour_venue_id', tv.id)
          .order('followup_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        const nextNumber = existing ? existing.followup_number + 1 : 1;
        if (nextNumber > rule.max_followups) continue;

        // For second follow-up, check second cutoff
        if (nextNumber === 2) {
          const contactedAt = new Date(tv.last_contacted_at);
          if (contactedAt > secondCutoff) continue;
        }

        // Check not already queued for this number
        const { data: alreadyQueued } = await supabase
          .from('followup_queue')
          .select('id')
          .eq('tour_venue_id', tv.id)
          .eq('followup_number', nextNumber)
          .maybeSingle();

        if (alreadyQueued) continue;

        await supabase.from('followup_queue').insert({
          act_id:         rule.act_id,
          tour_venue_id:  tv.id,
          venue_id:       tv.venue_id,
          tour_id:        tv.tour_id,
          followup_number: nextNumber,
          scheduled_for:  now.toISOString(),
          sent_at:        now.toISOString(),
        });

        await supabase
          .from('tour_venues')
          .update({ last_contacted_at: now.toISOString() })
          .eq('id', tv.id);

        // Notify band admin
        const { data: owner } = await supabase
          .from('profiles')
          .select('id')
          .eq('act_id', rule.act_id)
          .eq('role', 'band_admin')
          .limit(1)
          .maybeSingle();

        if (owner) {
          const venueName = (tv.venue as any)?.name || 'venue';
          await supabase.from('notifications').insert({
            user_id:    owner.id,
            act_id:     rule.act_id,
            type:       'followup_sent',
            message:    `Follow-up #${nextNumber} sent to ${venueName}`,
            action_url: '/tours',
            read:       false,
          });
        }

        processed++;
      } catch (e) {
        console.error('Follow-up error for tour_venue', tv.id, e);
        errors++;
      }
    }
  }

  return new Response(
    JSON.stringify({ processed, errors, timestamp: now.toISOString() }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
