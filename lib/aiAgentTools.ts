import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const FIND_VENUE_TOOL = {
  name: 'find_venue',
  description:
    "Search this band's venue database by name and/or city to get a venue_id. Read-only, safe to call freely.",
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      city: { type: 'string' },
    },
  },
};

export const BOOKING_UPSERT_TOOL = {
  name: 'stage_booking_upsert',
  description:
    "Propose creating a new show or updating an existing one. This does NOT write to the database — " +
    "it validates the request, resolves the venue, checks for double-booking conflicts on that date, " +
    "and returns a staged proposal that the user must explicitly confirm in the UI before anything is " +
    "saved. Always call find_venue first to get a real venue_id; never invent one.",
  input_schema: {
    type: 'object',
    properties: {
      booking_id: {
        type: 'string',
        description: 'UUID of an existing booking to update. Omit when creating a new show.',
      },
      venue_id: { type: 'string', description: 'UUID from find_venue. Required.' },
      show_date: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
      status: {
        type: 'string',
        enum: ['pitch', 'followup', 'negotiation', 'hold', 'contract', 'confirmed', 'advancing', 'completed', 'cancelled'],
        description: 'Defaults to "hold" for new shows if omitted.',
      },
      fee: { type: 'number' },
      deal_notes: { type: 'string' },
      load_in_time: { type: 'string', description: 'HH:MM 24-hour.' },
      set_time: { type: 'string', description: 'HH:MM 24-hour.' },
    },
    required: ['venue_id', 'show_date'],
  },
};

export async function execFindVenue(actId: string, args: { name?: string; city?: string }) {
  let query = supabase.from('venues').select('id, name, city, state').eq('act_id', actId).limit(5);
  if (args.name) query = query.ilike('name', `%${args.name}%`);
  if (args.city) query = query.ilike('city', `%${args.city}%`);
  const { data, error } = await query;
  if (error) throw new Error(`Venue search failed: ${error.message}`);
  return data ?? [];
}

export async function execStageBookingUpsert(
  actId: string,
  userId: string,
  args: {
    booking_id?: string;
    venue_id: string;
    show_date: string;
    status?: string;
    fee?: number;
    deal_notes?: string;
    load_in_time?: string;
    set_time?: string;
  }
) {
  // Confirm venue belongs to this act — never trust the model's venue_id blindly.
  const { data: venue, error: venueErr } = await supabase
    .from('venues')
    .select('id, name, city, state')
    .eq('id', args.venue_id)
    .eq('act_id', actId)
    .maybeSingle();
  if (venueErr) throw new Error(`Venue lookup failed: ${venueErr.message}`);
  if (!venue) throw new Error("That venue wasn't found in this band's database.");

  if (args.booking_id) {
    const { data: existing, error: existingErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', args.booking_id)
      .eq('act_id', actId)
      .maybeSingle();
    if (existingErr) throw new Error(`Booking lookup failed: ${existingErr.message}`);
    if (!existing) throw new Error("That booking wasn't found for this band.");
  }

  const { data: conflicts, error: conflictErr } = await supabase
    .from('bookings')
    .select('id, status, venues:venue_id(name, city, state)')
    .eq('act_id', actId)
    .eq('show_date', args.show_date)
    .neq('status', 'cancelled')
    .neq('id', args.booking_id ?? '00000000-0000-0000-0000-000000000000');
  if (conflictErr) throw new Error(`Conflict check failed: ${conflictErr.message}`);

  const payload = { ...args, venue_name: venue.name, venue_city: venue.city, venue_state: venue.state };

  const { data: staged, error: stageErr } = await supabase
    .from('ai_staged_actions')
    .insert({ act_id: actId, created_by: userId, action_type: 'booking_upsert', payload })
    .select()
    .single();
  if (stageErr) throw new Error(`Failed to stage proposal: ${stageErr.message}`);

  return {
    staged_action_id: staged.id,
    proposal: payload,
    conflicts: conflicts ?? [],
    requires_confirmation: true,
  };
}
