import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_URL = 'https://api.resend.com/emails';

async function sendEmail(apiKey: string, { to, subject, html }: { to: string; subject: string; html: string }) {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from: 'reminders@camelranchbooking.com', to, subject, html }),
  });
  return res.ok;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Get Resend key from platform_settings
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', ['resend_api_key', 'resend_from_email']);
  const cfg: Record<string, string> = {};
  for (const s of settings || []) cfg[s.key] = s.value;
  const resendKey = Deno.env.get('RESEND_API_KEY') || cfg['resend_api_key'] || '';

  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  const advanceDate    = fmt(addDays(today, 14));  // shows 14 days out
  const thankYouDate   = fmt(addDays(today, -7));  // shows 7 days ago

  let advanced = 0, thanked = 0;

  // ── Advance reminders ───────────────────────────────────────────────────
  const { data: advanceShows } = await supabase
    .from('bookings')
    .select(`id, show_date, email_stage, created_by,
      act:acts(act_name),
      venue:venues(name, city, state)`)
    .eq('show_date', advanceDate)
    .eq('email_stage', 'confirmation')
    .neq('status', 'cancelled');

  for (const show of advanceShows || []) {
    const createdBy = (show as any).created_by as string | null;
    if (!resendKey || !createdBy) continue;

    // Fetch agent profile for email routing
    const { data: agent } = await supabase
      .from('user_profiles')
      .select('id, display_name, email, personal_gmail')
      .eq('id', createdBy)
      .maybeSingle();

    const to = (agent as any)?.personal_gmail || (agent as any)?.email;
    if (!to) continue;

    const actName   = (show as any).act?.act_name || 'the act';
    const venueName = (show as any).venue?.name   || 'the venue';
    const city      = (show as any).venue?.city   || '';
    const showDate  = new Date(show.show_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });

    const sent = await sendEmail(resendKey, {
      to,
      subject: `Advance Due — ${actName} @ ${venueName} (${showDate})`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
          <h2 style="border-bottom:2px solid #c8921a;padding-bottom:8px;color:#c8921a">⚡ Advance Due — 14 Days Out</h2>
          <p><strong>${actName}</strong> plays <strong>${venueName}</strong>${city ? ` in ${city}` : ''} on <strong>${showDate}</strong>.</p>
          <p>Time to send the advance email with load-in time, sound check schedule, and hospitality details.</p>
          <a href="https://camelranchbooking.com/bookings/${show.id}"
             style="display:inline-block;background:#c8921a;color:#000;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:600;margin-top:8px">
            Open Booking
          </a>
          <p style="margin-top:24px;font-size:12px;color:#888">Camel Ranch Booking · camelranchbooking.com</p>
        </div>`,
    });

    if (sent) {
      await supabase.from('notifications').insert({
        user_id:    createdBy,
        type:       'advance_due',
        message:    `Advance due: ${actName} @ ${venueName} on ${showDate}. Time to send load-in details.`,
        related_id: show.id,
        action_url: `/bookings/${show.id}`,
      });
      await supabase.from('bookings').update({ email_stage: 'advance' }).eq('id', show.id);
      advanced++;
    }
  }

  // ── Thank-you reminders ─────────────────────────────────────────────────
  const { data: pastShows } = await supabase
    .from('bookings')
    .select(`id, show_date, email_stage, created_by,
      act:acts(act_name),
      venue:venues(name, city, state)`)
    .eq('show_date', thankYouDate)
    .eq('email_stage', 'advance')
    .neq('status', 'cancelled');

  for (const show of pastShows || []) {
    const createdBy = (show as any).created_by as string | null;
    if (!resendKey || !createdBy) continue;

    const { data: agent } = await supabase
      .from('user_profiles')
      .select('id, display_name, email, personal_gmail')
      .eq('id', createdBy)
      .maybeSingle();

    const to = (agent as any)?.personal_gmail || (agent as any)?.email;
    if (!to) continue;

    const actName   = (show as any).act?.act_name || 'the act';
    const venueName = (show as any).venue?.name   || 'the venue';
    const showDate  = new Date(show.show_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });

    const sent = await sendEmail(resendKey, {
      to,
      subject: `Send Thank You — ${actName} @ ${venueName}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
          <h2 style="border-bottom:2px solid #a78bfa;padding-bottom:8px;color:#a78bfa">✦ Time to Send a Thank You</h2>
          <p>It's been 7 days since <strong>${actName}</strong> played <strong>${venueName}</strong> on <strong>${showDate}</strong>.</p>
          <p>A short thank-you keeps the relationship warm for future bookings.</p>
          <a href="https://camelranchbooking.com/bookings/${show.id}"
             style="display:inline-block;background:#a78bfa;color:#000;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:600;margin-top:8px">
            Open Booking
          </a>
          <p style="margin-top:24px;font-size:12px;color:#888">Camel Ranch Booking · camelranchbooking.com</p>
        </div>`,
    });

    if (sent) {
      await supabase.from('notifications').insert({
        user_id:    createdBy,
        type:       'thank_you_due',
        message:    `Send a thank you to ${venueName} for the ${actName} show on ${showDate}.`,
        related_id: show.id,
        action_url: `/bookings/${show.id}`,
      });
      await supabase.from('bookings').update({ email_stage: 'thank_you' }).eq('id', show.id);
      thanked++;
    }
  }

  return new Response(JSON.stringify({ advanced, thanked }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
