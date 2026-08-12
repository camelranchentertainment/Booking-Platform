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
    "Propose creating a new show or travel day, or updating an existing booking. Does NOT write to the " +
    "database — validates the request, checks for conflicts, and returns a staged proposal the user must " +
    "confirm. For shows (entry_type 'show'), always call find_venue first to get a real venue_id; never " +
    "invent one. For travel/logistics days (entry_type 'travel'), venue_id is not required.",
  input_schema: {
    type: 'object',
    properties: {
      booking_id: {
        type: 'string',
        description: 'UUID of an existing booking to update. Omit when creating.',
      },
      venue_id: {
        type: 'string',
        description: 'UUID from find_venue. Required when entry_type is "show".',
      },
      show_date: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
      entry_type: {
        type: 'string',
        enum: ['show', 'travel'],
        description: 'Defaults to "show". Use "travel" for drive/logistics days with no venue.',
      },
      status: {
        type: 'string',
        enum: ['pitch', 'followup', 'negotiation', 'hold', 'contract', 'confirmed', 'advancing', 'completed', 'cancelled'],
        description: 'Defaults to "hold" for new entries if omitted.',
      },
      tour_id: {
        type: 'string',
        description: 'UUID from find_tour. Attach this show/travel day to a tour.',
      },
      fee: { type: 'number' },
      deal_notes: { type: 'string' },
      load_in_time: { type: 'string', description: 'HH:MM 24-hour.' },
      soundcheck_time: { type: 'string', description: 'HH:MM 24-hour.' },
      set_time: { type: 'string', description: 'HH:MM 24-hour.' },
      end_time: { type: 'string', description: 'HH:MM 24-hour.' },
      venue_contact_name: { type: 'string' },
      sound_system: { type: 'string' },
      lodging_details: { type: 'string' },
      special_requirements: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['show_date'],
  },
};

export const FIND_TOUR_TOOL = {
  name: 'find_tour',
  description:
    "Search this band's tours by name to get a tour_id. Read-only, safe to call freely. Always call " +
    "this before staging anything tied to a specific tour (shows, travel days, tour notes, expenses).",
  input_schema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
};

export const TOUR_NOTES_UPDATE_TOOL = {
  name: 'stage_tour_notes_update',
  description:
    "Propose replacing this tour's routing_notes field with new text. Does NOT write to the database — " +
    "stages a proposal showing old vs. new text for the user to confirm. Always call find_tour first " +
    "to get a real tour_id.",
  input_schema: {
    type: 'object',
    properties: {
      tour_id: { type: 'string', description: 'UUID from find_tour.' },
      notes: { type: 'string', description: 'Full replacement text for the tour notes.' },
    },
    required: ['tour_id', 'notes'],
  },
};

export const STAGE_EXPENSE_TOOL = {
  name: 'stage_expense',
  description:
    'Propose a new expense line for a tour. Defaults to status "potential" (projected/estimated cost) ' +
    'unless the user has explicitly said the cost is already confirmed/paid. Does NOT write to the ' +
    'database — stages a proposal for the user to confirm. Always call find_tour first.',
  input_schema: {
    type: 'object',
    properties: {
      tour_id: { type: 'string', description: 'UUID from find_tour.' },
      category: { type: 'string', description: 'e.g. "Groceries", "Camp Supplies", "Fuel".' },
      amount: { type: 'number' },
      expense_date: {
        type: 'string',
        description: 'ISO date YYYY-MM-DD. Use the tour start date if unspecified.',
      },
      status: {
        type: 'string',
        enum: ['potential', 'confirmed'],
        description: 'Defaults to "potential".',
      },
      notes: { type: 'string' },
    },
    required: ['tour_id', 'category', 'amount', 'expense_date'],
  },
};

export const STAGE_VENUE_AND_BOOKING_TOOL = {
  name: 'stage_venue_and_booking',
  description:
    "Propose creating a NEW venue AND a show in one confirmed step. Use this ONLY when find_venue " +
    "returned no match AND the user has provided at minimum a venue name, city, AND state. If city " +
    "or state are missing, ask the user for them first — never call this tool with blank city or " +
    "state, as both are NOT NULL in the database. Does NOT write to the database — stages a combined " +
    "proposal the user must confirm. If tour context is needed, call find_tour first.",
  input_schema: {
    type: 'object',
    properties: {
      venue_name:            { type: 'string', description: 'Full venue name. Required.' },
      venue_city:            { type: 'string', description: 'City. Required — NOT NULL.' },
      venue_state:           { type: 'string', description: 'State/province abbreviation. Required — NOT NULL.' },
      venue_address:         { type: 'string' },
      venue_zip:             { type: 'string' },
      venue_phone:           { type: 'string' },
      venue_email:           { type: 'string' },
      venue_website:         { type: 'string' },
      venue_type:            { type: 'string' },
      venue_capacity:        { type: 'number' },
      venue_booking_contact: { type: 'string' },
      venue_notes:           { type: 'string' },
      show_date:             { type: 'string', description: 'ISO date YYYY-MM-DD. Required.' },
      entry_type: {
        type: 'string',
        enum: ['show', 'travel'],
        description: 'Defaults to "show".',
      },
      status: {
        type: 'string',
        enum: ['pitch', 'followup', 'negotiation', 'hold', 'contract', 'confirmed', 'advancing', 'completed', 'cancelled'],
      },
      tour_id:               { type: 'string', description: 'UUID from find_tour.' },
      fee:                   { type: 'number' },
      deal_notes:            { type: 'string' },
      load_in_time:          { type: 'string', description: 'HH:MM 24-hour.' },
      soundcheck_time:       { type: 'string', description: 'HH:MM 24-hour.' },
      set_time:              { type: 'string', description: 'HH:MM 24-hour.' },
      end_time:              { type: 'string', description: 'HH:MM 24-hour.' },
      venue_contact_name:    { type: 'string' },
      sound_system:          { type: 'string' },
      lodging_details:       { type: 'string' },
      special_requirements:  { type: 'string' },
      notes:                 { type: 'string' },
    },
    required: ['venue_name', 'venue_city', 'venue_state', 'show_date'],
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

export async function execFindTour(actId: string, name: string) {
  const { data, error } = await supabase
    .from('tours')
    .select('id, name, start_date, end_date, status')
    .eq('act_id', actId)
    .ilike('name', `%${name}%`)
    .limit(5);
  if (error) throw new Error(`Tour search failed: ${error.message}`);
  return data ?? [];
}

async function verifyTourOwnership(actId: string, tourId: string) {
  const { data, error } = await supabase
    .from('tours')
    .select('id, name, routing_notes')
    .eq('id', tourId)
    .eq('act_id', actId)
    .maybeSingle();
  if (error) throw new Error(`Tour lookup failed: ${error.message}`);
  if (!data) throw new Error("That tour wasn't found for this band.");
  return data;
}

export async function execStageBookingUpsert(
  actId: string,
  userId: string,
  args: {
    booking_id?: string;
    venue_id?: string;
    show_date: string;
    entry_type?: string;
    status?: string;
    tour_id?: string;
    fee?: number;
    deal_notes?: string;
    load_in_time?: string;
    soundcheck_time?: string;
    set_time?: string;
    end_time?: string;
    venue_contact_name?: string;
    sound_system?: string;
    lodging_details?: string;
    special_requirements?: string;
    notes?: string;
  }
) {
  const entryType = args.entry_type ?? 'show';

  // Venue lookup — required for shows, skipped for travel days.
  let venueInfo: { name: string; city: string; state: string } | null = null;
  if (entryType !== 'travel') {
    if (!args.venue_id) throw new Error('venue_id is required for show entries. Call find_venue first.');
    const { data: venue, error: venueErr } = await supabase
      .from('venues')
      .select('id, name, city, state')
      .eq('id', args.venue_id)
      .eq('act_id', actId)
      .maybeSingle();
    if (venueErr) throw new Error(`Venue lookup failed: ${venueErr.message}`);
    if (!venue) throw new Error("That venue wasn't found in this band's database.");
    venueInfo = { name: venue.name, city: venue.city, state: venue.state };
  }

  // Verify tour ownership when a tour_id is provided.
  let tourName: string | null = null;
  if (args.tour_id) {
    const tour = await verifyTourOwnership(actId, args.tour_id);
    tourName = tour.name;
  }

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

  const payload = {
    ...args,
    entry_type: entryType,
    ...(venueInfo && { venue_name: venueInfo.name, venue_city: venueInfo.city, venue_state: venueInfo.state }),
    ...(tourName && { tour_name: tourName }),
  };

  const { data: staged, error: stageErr } = await supabase
    .from('ai_staged_actions')
    .insert({ act_id: actId, created_by: userId, action_type: 'booking_upsert', payload })
    .select()
    .single();
  if (stageErr) throw new Error(`Failed to stage proposal: ${stageErr.message}`);

  return {
    action_type: 'booking_upsert' as const,
    staged_action_id: staged.id,
    proposal: payload,
    conflicts: conflicts ?? [],
    requires_confirmation: true,
  };
}

export async function execStageTourNotesUpdate(
  actId: string,
  userId: string,
  args: { tour_id: string; notes: string }
) {
  const tour = await verifyTourOwnership(actId, args.tour_id);

  const payload = {
    tour_id: args.tour_id,
    tour_name: tour.name,
    old_notes: tour.routing_notes ?? '',
    new_notes: args.notes,
  };

  const { data: staged, error: stageErr } = await supabase
    .from('ai_staged_actions')
    .insert({ act_id: actId, created_by: userId, action_type: 'tour_notes_update', payload })
    .select()
    .single();
  if (stageErr) throw new Error(`Failed to stage proposal: ${stageErr.message}`);

  return { action_type: 'tour_notes_update' as const, staged_action_id: staged.id, proposal: payload, requires_confirmation: true };
}

export async function execStageVenueAndBooking(
  actId: string,
  userId: string,
  args: {
    venue_name: string;
    venue_city: string;
    venue_state: string;
    venue_address?: string;
    venue_zip?: string;
    venue_phone?: string;
    venue_email?: string;
    venue_website?: string;
    venue_type?: string;
    venue_capacity?: number;
    venue_booking_contact?: string;
    venue_notes?: string;
    show_date: string;
    entry_type?: string;
    status?: string;
    tour_id?: string;
    fee?: number;
    deal_notes?: string;
    load_in_time?: string;
    soundcheck_time?: string;
    set_time?: string;
    end_time?: string;
    venue_contact_name?: string;
    sound_system?: string;
    lodging_details?: string;
    special_requirements?: string;
    notes?: string;
  }
) {
  if (!args.venue_name?.trim()) throw new Error('venue_name is required.');
  if (!args.venue_city?.trim()) throw new Error('venue_city is required (NOT NULL). Ask the user for the city first.');
  if (!args.venue_state?.trim()) throw new Error('venue_state is required (NOT NULL). Ask the user for the state first.');

  let tourName: string | null = null;
  if (args.tour_id) {
    const tour = await verifyTourOwnership(actId, args.tour_id);
    tourName = tour.name;
  }

  const { data: conflicts, error: conflictErr } = await supabase
    .from('bookings')
    .select('id, status, venues:venue_id(name, city, state)')
    .eq('act_id', actId)
    .eq('show_date', args.show_date)
    .neq('status', 'cancelled');
  if (conflictErr) throw new Error(`Conflict check failed: ${conflictErr.message}`);

  const payload = {
    venue_name:    args.venue_name.trim(),
    venue_city:    args.venue_city.trim(),
    venue_state:   args.venue_state.trim(),
    ...(args.venue_address         && { venue_address: args.venue_address }),
    ...(args.venue_zip             && { venue_zip: args.venue_zip }),
    ...(args.venue_phone           && { venue_phone: args.venue_phone }),
    ...(args.venue_email           && { venue_email: args.venue_email }),
    ...(args.venue_website         && { venue_website: args.venue_website }),
    ...(args.venue_type            && { venue_type: args.venue_type }),
    ...(args.venue_capacity != null && { venue_capacity: args.venue_capacity }),
    ...(args.venue_booking_contact && { venue_booking_contact: args.venue_booking_contact }),
    ...(args.venue_notes           && { venue_notes: args.venue_notes }),
    show_date:  args.show_date,
    entry_type: args.entry_type ?? 'show',
    status:     args.status ?? 'hold',
    ...(args.tour_id              && { tour_id: args.tour_id }),
    ...(tourName                  && { tour_name: tourName }),
    ...(args.fee != null          && { fee: args.fee }),
    ...(args.deal_notes           && { deal_notes: args.deal_notes }),
    ...(args.load_in_time         && { load_in_time: args.load_in_time }),
    ...(args.soundcheck_time      && { soundcheck_time: args.soundcheck_time }),
    ...(args.set_time             && { set_time: args.set_time }),
    ...(args.end_time             && { end_time: args.end_time }),
    ...(args.venue_contact_name   && { venue_contact_name: args.venue_contact_name }),
    ...(args.sound_system         && { sound_system: args.sound_system }),
    ...(args.lodging_details      && { lodging_details: args.lodging_details }),
    ...(args.special_requirements && { special_requirements: args.special_requirements }),
    ...(args.notes                && { notes: args.notes }),
  };

  const { data: staged, error: stageErr } = await supabase
    .from('ai_staged_actions')
    .insert({ act_id: actId, created_by: userId, action_type: 'venue_and_booking_upsert', payload })
    .select()
    .single();
  if (stageErr) throw new Error(`Failed to stage proposal: ${stageErr.message}`);

  return {
    action_type: 'venue_and_booking_upsert' as const,
    staged_action_id: staged.id,
    proposal: payload,
    conflicts: conflicts ?? [],
    requires_confirmation: true,
  };
}

export async function execStageExpense(
  actId: string,
  userId: string,
  args: {
    tour_id: string;
    category: string;
    amount: number;
    expense_date: string;
    status?: string;
    notes?: string;
  }
) {
  const tour = await verifyTourOwnership(actId, args.tour_id);

  const payload = { ...args, status: args.status ?? 'potential', tour_name: tour.name };

  const { data: staged, error: stageErr } = await supabase
    .from('ai_staged_actions')
    .insert({ act_id: actId, created_by: userId, action_type: 'expense_insert', payload })
    .select()
    .single();
  if (stageErr) throw new Error(`Failed to stage proposal: ${stageErr.message}`);

  return { action_type: 'expense_insert' as const, staged_action_id: staged.id, proposal: payload, requires_confirmation: true };
}
