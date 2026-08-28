import { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '../../lib/supabase';
import { getSetting } from '../../lib/platformSettings';
import {
  execFindVenue,
  execFindTour,
  execStageBookingUpsert,
  execStageTourNotesUpdate,
  execStageExpense,
  execStageTourInsert,
  execStageVenueAndBooking,
  execStageCalendarSettingsUpdate,
  execFindPersonnel,
  execStagePersonnelUpsert,
} from '../../lib/aiAgentTools';
import { HELP_SYSTEM_PROMPT } from '../../lib/helpSystemPrompt';
import { formatShowDate } from '../../lib/formatDate';

export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };

// ── System prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an AI booking agent for Camel Ranch Booking. You help DIY bands book shows.
Be direct, confident, and concise. Music industry voice. Bold key numbers with **asterisks**.

You have full platform reference documentation in a separate system block below (feature guides, common
workflows, troubleshooting). When the user asks a "how do I..." or "what is..." question about the
platform itself, answer it directly and confidently in plain text using that documentation — do not
deflect to a separate help page, and do not say you don't know how the platform works.

You can: answer pipeline questions, answer platform how-to questions, draft outreach, find venues, queue
bulk email batches (with user approval first), and propose creating tours and adding/updating shows,
travel days, tour notes, and projected expenses
(with user approval first — you never write directly).

CRITICAL FORMATTING RULE:
When the user asks to send bulk outreach, find venues in a city/region, OR add/update anything about a
tour (shows, travel days, tour notes, expenses), respond ONLY with valid JSON in the exact shape for
that action. Output the raw JSON object only — no markdown code fences (no \`\`\`), no text before or
after it. For ALL other messages: respond with plain text only — no JSON, no wrapper.

For bulk tour outreach ("send emails to targets on [tour]", "blast the Spring Tour", etc.):
{"reply":"<conversational text>","action":{"type":"tour_outreach","tourName":"<best match from context>"}}

For city venue search ("find venues in Tulsa", "what clubs are in Nashville for July 4th", etc.):
{"reply":"<conversational text>","action":{"type":"city_search","city":"<city>","state":"<2-letter state>","dateRange":"<parsed range or empty>"}}

For creating a brand new tour ("create a tour called X", "start a new tour for these dates", or when the
user wants to add shows/notes to a tour that doesn't exist yet):
{"reply":"<conversational text confirming the new tour details>","action":{"type":"tour_create","name":"<tour name>","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","description":"<optional>"}}
After the user confirms a tour_create proposal and it's saved, you can then use stage_items against that
same tour name in a follow-up message — it will now be found.

For adding/updating a tour's itinerary, notes, or budget ("add a show at X on Y", "add a travel day",
"log the Sturgis tour notes", "add a projected expense for groceries"), respond with an array so a user
can describe several things (4 shows, 2 travel days, notes, a budget line) in one message:
{"reply":"<conversational text summarizing what you're proposing>","action":{"type":"stage_items","tourName":"<tour name, required — ask the user if unclear>","items":[
  {"kind":"show","venueName":"<venue name>","venueCity":"<city, only if venue is new>","venueState":"<state, only if venue is new>","date":"YYYY-MM-DD","setTime":"HH:MM","loadInTime":"HH:MM","soundcheckTime":"HH:MM","endTime":"HH:MM","notes":"<optional>"},
  {"kind":"travel","date":"YYYY-MM-DD","notes":"<travel plan text>"},
  {"kind":"tour_notes","notes":"<full replacement text for the tour's notes>"},
  {"kind":"expense","category":"<e.g. Groceries>","amount":123.45,"date":"YYYY-MM-DD","status":"potential","notes":"<optional>"}
]}}
Only include the fields you actually have values for on each item (all fields except kind/date are
optional per item). Never invent a venue_id or tour_id — those get resolved server-side by name. If a
venue doesn't exist yet and you don't know its city/state, ask the user before staging that item.

For calendar sync settings ("turn on calendar sync", "disable sync", "rename my calendar to X"):
{"reply":"<conversational text>","action":{"type":"calendar_settings_update","sync_enabled":true,"calendar_name":"<optional>"}}
Only include the field(s) actually being changed. You never see and must never ask for or reference
Google credentials, tokens, or API keys — those are configured outside this chat entirely.

For roster/band member management ("add Jake as guitarist", "update Sarah's pay rate to $150",
"add these 3 people to the roster", "mark Doc as inactive"):
{"reply":"<conversational text>","action":{"type":"stage_personnel","items":[
  {"personnel_id":"<uuid from find_personnel, only when updating someone existing>","name":"<required when adding new>","instrument_role":"<e.g. Guitar>","default_pay_amount":150,"phone":"<optional>","email":"<optional>","is_active":true}
]}}
Just give the person's name when updating someone existing — it's matched to their roster entry
automatically; you don't need to look up an ID yourself. If more than one person matches that name,
you'll be told and should ask the user to clarify. IMPORTANT: adding or updating a roster entry never invites that
person to log in or grants them platform access — that is always a separate, manual step the user does
themselves on the Members page. Never propose, offer, or claim to send an invite, a login link, or
platform access of any kind, even if asked — tell the user to use "Invite to log in" on the Members
page for that instead.

Always confirm the list BEFORE sending or saving anything. Wait for explicit approval.`;

// ── Build context string from live DB data ─────────────────────────────────────
async function buildContext(service: ReturnType<typeof getServiceClient>, actId: string): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  const [actRes, bookingsRes, toursRes] = await Promise.all([
    service.from('acts').select('act_name, genre, bio, website').eq('id', actId).single(),
    service.from('bookings')
      .select('status, show_date, venue:venues(name, city, state)')
      .eq('act_id', actId).neq('status', 'cancelled').order('show_date').limit(30),
    service.from('tours')
      .select('id, name, status, start_date, end_date')
      .eq('act_id', actId).neq('status', 'cancelled').limit(8),
  ]);

  const act = actRes.data;
  const bookings = bookingsRes.data || [];
  const tours = toursRes.data || [];
  const upcoming = bookings.filter((b: any) => ['confirmed', 'advancing'].includes(b.status) && b.show_date >= today).slice(0, 5);
  const pipeline = bookings.filter((b: any) => ['pitch', 'negotiation', 'hold'].includes(b.status));

  return [
    `Act: ${act?.act_name}${act?.genre ? ` (${act.genre})` : ''}`,
    act?.bio ? `Bio: ${act.bio}` : '',
    act?.website ? `Website: ${act.website}` : '',
    `Today: ${today}`,
    '',
    `Upcoming confirmed shows (${upcoming.length}):`,
    ...upcoming.map((b: any) => `  - ${b.show_date}: ${b.venue?.name || 'TBD'}${b.venue?.city ? `, ${b.venue.city}` : ''}`),
    '',
    `Pipeline (${pipeline.length} pitching/negotiating):`,
    ...pipeline.slice(0, 5).map((b: any) => `  - ${b.venue?.name || 'TBD'}${b.venue?.city ? `, ${b.venue.city}` : ''} [${b.status}]`),
    '',
    `Tours (${tours.length}):`,
    ...tours.map((t: any) => `  - "${t.name}" id=${t.id} (${t.status})${t.start_date ? ` ${t.start_date}–${t.end_date || 'TBD'}` : ''}`),
  ].filter(s => s !== null).join('\n');
}

// ── Resolve tour outreach action — query venues + generate draft ───────────────
async function resolveTourOutreach(
  service: ReturnType<typeof getServiceClient>,
  actId: string,
  tourName: string,
  anthropicKey: string,
): Promise<{ tourId: string; tourName: string; venues: any[]; draft: { subject: string; body: string } } | { error: string }> {
  // Find tour by name (fuzzy)
  const { data: tours } = await service.from('tours')
    .select('id, name, start_date, end_date, routing_notes')
    .eq('act_id', actId).neq('status', 'cancelled');

  const tour = (tours || []).find((t: any) =>
    t.name.toLowerCase().includes(tourName.toLowerCase()) ||
    tourName.toLowerCase().includes(t.name.toLowerCase())
  ) || tours?.[0];

  if (!tour) return { error: `No tour found matching "${tourName}". Available tours: ${(tours || []).map((t: any) => t.name).join(', ') || 'none'}` };

  // Get target venues for this tour
  const { data: tvRows } = await service
    .from('tour_venues')
    .select(`
      id,
      venue:venues(id, name, city, state, email, capacity),
      contact:contacts(first_name, last_name, email)
    `)
    .eq('tour_id', tour.id)
    .eq('status', 'target');

  const venues = (tvRows || []).filter((tv: any) => tv.venue);
  if (!venues.length) return { error: `No venues with "target" status found on "${tour.name}". Add some targets first.` };

  // Fetch act for draft
  const { data: act } = await service.from('acts').select('act_name, genre, bio, website, spotify, instagram').eq('id', actId).single();

  // Generate one shared draft email via AI
  const fmt = (d: string) => formatShowDate(d, { month: 'long', day: 'numeric', year: 'numeric' });
  const dateRange = tour.start_date
    ? `${fmt(tour.start_date)}${tour.end_date ? ` through ${fmt(tour.end_date)}` : ''}`
    : '[dates TBD]';

  const draftPrompt = `Write a cold pitch booking email for the following act. Use {venue_name} and {contact_name} as placeholders that will be personalized per recipient.

Act: ${act?.act_name}
Genre: ${act?.genre || 'N/A'}
Bio: ${act?.bio || 'Solid regional act with a growing following'}
Website: ${act?.website || ''}
Tour: ${tour.name} — ${dateRange}
Routing notes: ${tour.routing_notes || 'N/A'}

Keep it under 130 words. Professional, direct, music industry tone. Clear call-to-action to hold a date.
No em dashes. No bullet points in body.

Output ONLY valid JSON: { "subject": "...", "body": "..." }`;

  const client = new Anthropic({ apiKey: anthropicKey });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: draftPrompt }],
  });
  const raw = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const draft = jsonMatch ? JSON.parse(jsonMatch[0]) : { subject: `Booking inquiry — ${act?.act_name}`, body: `Hi {contact_name},\n\nWe're reaching out about booking ${act?.act_name} at {venue_name} during our ${tour.name} run (${dateRange}).\n\nWould love to discuss holding a date. Please let me know if you have availability.\n\nBest,\nCamel Ranch Booking` };

  return {
    tourId: tour.id,
    tourName: tour.name,
    venues: venues.map((tv: any) => ({
      tourVenueId: tv.id,
      venueId:     tv.venue.id,
      name:        tv.venue.name,
      city:        tv.venue.city,
      state:       tv.venue.state,
      email:       tv.venue.email || tv.contact?.email || null,
      contactName: tv.contact ? `${tv.contact.first_name || ''} ${tv.contact.last_name || ''}`.trim() : null,
    })),
    draft,
  };
}

// ── Resolve city search action ────────────────────────────────────────────────
async function resolveCitySearch(
  service: ReturnType<typeof getServiceClient>,
  actId: string,
  city: string,
  state: string,
): Promise<{ city: string; state: string; venues: any[]; activeTour: any | null }> {
  // Get active tour (most recent)
  const { data: tours } = await service.from('tours')
    .select('id, name').eq('act_id', actId)
    .in('status', ['active', 'planning']).order('created_at', { ascending: false }).limit(1);
  const activeTour = tours?.[0] || null;

  // Find venues in city, excluding ones already on the active tour
  let query: any = service.from('venues')
    .select('id, name, city, state, email, capacity, venue_type')
    .ilike('city', `%${city}%`)
    .order('name').limit(20);
  if (state) query = query.ilike('state', state);

  const { data: allVenues } = await query;

  let excluded: Set<string> = new Set();
  if (activeTour) {
    const { data: existing } = await service.from('tour_venues')
      .select('venue_id').eq('tour_id', activeTour.id);
    excluded = new Set((existing || []).map((r: any) => r.venue_id));
  }

  const venues = (allVenues || []).filter((v: any) => !excluded.has(v.id));
  return { city, state, venues, activeTour };
}

// ── Resolve stage_items action — look up venue/tour by name, stage each item ───
async function resolveStageItems(
  actId: string,
  userId: string,
  tourName: string,
  items: Array<{
    kind: 'show' | 'travel' | 'tour_notes' | 'expense';
    venueName?: string;
    venueCity?: string;
    venueState?: string;
    date?: string;
    setTime?: string;
    loadInTime?: string;
    soundcheckTime?: string;
    endTime?: string;
    category?: string;
    amount?: number;
    status?: string;
    notes?: string;
  }>,
): Promise<{ staged: any[]; errors: string[] }> {
  const tours = await execFindTour(actId, tourName);
  const tour = tours[0];
  if (!tour) {
    return { staged: [], errors: [`No tour found matching "${tourName}". Create it first, or check the name.`] };
  }

  const staged: any[] = [];
  const errors: string[] = [];

  for (const item of items) {
    try {
      if (item.kind === 'show' || item.kind === 'travel') {
        let venue_id: string | undefined;
        if (item.kind === 'show') {
          if (!item.venueName) { errors.push('A show item is missing a venue name.'); continue; }
          const venues = await execFindVenue(actId, { name: item.venueName });
          if (!venues.length) {
            if (item.venueCity && item.venueState) {
              try {
                const result = await execStageVenueAndBooking(actId, userId, {
                  venue_name: item.venueName,
                  venue_city: item.venueCity,
                  venue_state: item.venueState,
                  show_date: item.date || '',
                  entry_type: 'show',
                  set_time: item.setTime,
                  load_in_time: item.loadInTime,
                  soundcheck_time: item.soundcheckTime,
                  end_time: item.endTime,
                  notes: item.notes,
                  tour_id: tour.id,
                });
                staged.push({ kind: 'venue_and_booking', ...result });
              } catch (e: any) {
                errors.push(e.message || `Couldn't stage "${item.venueName}".`);
              }
              continue;
            }
            errors.push(`No venue found matching "${item.venueName}" — what city and state is it in? I can add it and the show together.`);
            continue;
          }
          venue_id = venues[0].id;
        }
        if (!item.date) { errors.push('A date is required for every show/travel item.'); continue; }
        const result = await execStageBookingUpsert(actId, userId, {
          venue_id,
          show_date: item.date,
          status: 'confirmed',
          entry_type: item.kind === 'travel' ? 'travel' : 'show',
          load_in_time: item.loadInTime,
          set_time: item.setTime,
          soundcheck_time: item.soundcheckTime,
          end_time: item.endTime,
          notes: item.notes,
          tour_id: tour.id,
        });
        staged.push({ kind: item.kind, ...result });
      } else if (item.kind === 'tour_notes') {
        if (!item.notes) { errors.push('Tour notes item has no text.'); continue; }
        const result = await execStageTourNotesUpdate(actId, userId, { tour_id: tour.id, notes: item.notes });
        staged.push({ kind: 'tour_notes', ...result });
      } else if (item.kind === 'expense') {
        if (!item.category || item.amount == null || !item.date) {
          errors.push('An expense item is missing category, amount, or date.');
          continue;
        }
        const result = await execStageExpense(actId, userId, {
          tour_id: tour.id,
          category: item.category,
          amount: item.amount,
          expense_date: item.date,
          status: item.status ?? 'potential',
          notes: item.notes,
        });
        staged.push({ kind: 'expense', ...result });
      }
    } catch (e: any) {
      errors.push(e.message || 'Failed to stage an item.');
    }
  }

  return { staged, errors };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const anonClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { message, history = [], saveNote } = req.body as {
    message: string;
    history: Anthropic.MessageParam[];
    saveNote?: boolean;
  };
  if (!message) return res.status(400).json({ error: 'message required' });

  const service = getServiceClient();

  const { data: profile } = await service.from('profiles').select('act_id').eq('id', user.id).single();
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

  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: message }];

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: HELP_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `Current pipeline context:\n\n${context}` },
      ],
      messages,
    });

    const raw = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    const wasTruncated = response.stop_reason === 'max_tokens';

    // Strip markdown code fences if present, then look for a JSON object
    // anywhere in the response — don't require the whole response to be bare JSON.
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let parsed: any;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // The JSON is malformed — almost always because the response was cut off
        // mid-object. Never show broken JSON to the user; ask them to retry with
        // a smaller request instead.
        if (wasTruncated) {
          return res.status(200).json({
            reply: "That was a lot to process in one go and my response got cut off. Could you split it into a couple of smaller messages — for example, the shows first, then travel days and notes separately?",
          });
        }
        /* fall through to plain text for any other parse failure */
      }

      if (parsed?.action?.type === 'tour_outreach') {
        const result = await resolveTourOutreach(service, actId, parsed.action.tourName || '', anthropicKey);
        if ('error' in result) {
          return res.status(200).json({ reply: result.error });
        }
        return res.status(200).json({ reply: parsed.reply || `Found ${result.venues.length} target venues on ${result.tourName}.`, action: { type: 'tour_outreach', ...result } });
      }

      if (parsed?.action?.type === 'city_search') {
        const { city, state, dateRange } = parsed.action;
        const result = await resolveCitySearch(service, actId, city || '', state || '');
        const replyText = result.venues.length > 0
          ? (parsed.reply || `Found **${result.venues.length}** venues in ${city}, ${state}.${result.activeTour ? ` I can add them to your "${result.activeTour.name}" tour.` : ''}`)
          : `No venues found in ${city}${state ? `, ${state}` : ''} that aren't already on your tour.`;
        return res.status(200).json({ reply: replyText, action: { type: 'city_search', ...result, dateRange: dateRange || '' } });
      }

      if (parsed?.action?.type === 'tour_create') {
        const { name, start_date, end_date, description } = parsed.action;
        try {
          const result = await execStageTourInsert(actId, user.id, { name: name || '', start_date, end_date, description });
          return res.status(200).json({
            reply: parsed.reply || `Staged a new tour: "${name}"${start_date ? ` (${start_date}${end_date ? ` – ${end_date}` : ''})` : ''}. Confirm to save it.`,
            action: { type: 'stage_items', staged: [{ kind: 'tour_create', ...result }], errors: [] },
          });
        } catch (e: any) {
          return res.status(200).json({ reply: e.message || "Couldn't stage that tour." });
        }
      }

      if (parsed?.action?.type === 'calendar_settings_update') {
        const { sync_enabled, calendar_name } = parsed.action;
        try {
          const result = await execStageCalendarSettingsUpdate(actId, user.id, { sync_enabled, calendar_name });
          return res.status(200).json({
            reply: parsed.reply || 'Staged that calendar settings change. Confirm to save it.',
            action: { type: 'stage_items', staged: [{ kind: 'calendar_settings_update', ...result }], errors: [] },
          });
        } catch (e: any) {
          return res.status(200).json({ reply: e.message || "Couldn't stage that calendar change." });
        }
      }

      if (parsed?.action?.type === 'stage_personnel') {
        const items = (parsed.action.items || []) as Array<{
          personnel_id?: string; name?: string; instrument_role?: string;
          default_pay_amount?: number; phone?: string; email?: string; is_active?: boolean;
        }>;
        const staged: any[] = [];
        const errors: string[] = [];
        for (const item of items) {
          try {
            let personnel_id = item.personnel_id;
            // Resolve name → existing entry server-side, same pattern as venue/tour lookups —
            // the model doesn't call a separate tool for this in the JSON-action architecture.
            if (!personnel_id && item.name) {
              const matches = await execFindPersonnel(actId, item.name);
              if (matches.length === 1) {
                personnel_id = matches[0].id;
              } else if (matches.length > 1) {
                errors.push(`Multiple roster entries match "${item.name}" — which one did you mean?`);
                continue;
              }
              // zero matches → falls through as a new addition, which is correct
            }
            const result = await execStagePersonnelUpsert(actId, user.id, { ...item, personnel_id });
            staged.push({ kind: 'personnel_upsert', ...result });
          } catch (e: any) {
            errors.push(e.message || `Couldn't stage "${item.name || item.personnel_id}".`);
          }
        }
        const replyText = staged.length
          ? (parsed.reply || `Staged ${staged.length} roster change${staged.length !== 1 ? 's' : ''} for review.`)
          : (errors[0] || 'Nothing could be staged.');
        return res.status(200).json({ reply: replyText, action: { type: 'stage_items', staged, errors } });
      }

      if (parsed?.action?.type === 'stage_items') {
        const { tourName, items } = parsed.action;
        const { staged, errors } = await resolveStageItems(actId, user.id, tourName || '', items || []);
        const replyText = staged.length
          ? (parsed.reply || `Staged ${staged.length} item${staged.length !== 1 ? 's' : ''} for review.`)
          : (errors[0] || 'Nothing could be staged.');
        return res.status(200).json({ reply: replyText, action: { type: 'stage_items', staged, errors } });
      }

      // Valid JSON but not a recognized action — use reply field or raw
      if (parsed?.reply) return res.status(200).json({ reply: parsed.reply });
    }

    const reply = raw.trim();

    if (saveNote && reply) {
      const todayStr = new Date().toISOString().split('T')[0];
      const thread = [...history.map((m: any) => `${m.role === 'user' ? 'Q' : 'A'}: ${typeof m.content === 'string' ? m.content : ''}`), `Q: ${message}`, `A: ${reply}`].join('\n');
      await service.from('daily_notes').upsert(
        { user_id: user.id, note_date: todayStr, content: thread, act_id: actId, visibility: 'admin_only', updated_at: new Date().toISOString() },
        { onConflict: 'user_id,note_date' },
      );
    }

    return res.status(200).json({ reply });
  } catch (err: any) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'AI is busy — try again in a moment' });
    if (err instanceof Anthropic.APIError) {
      const inner = (err.error as any)?.error?.message;
      return res.status(502).json({ error: inner || 'AI features temporarily unavailable — please try again' });
    }
    return res.status(500).json({ error: err.message });
  }
}
