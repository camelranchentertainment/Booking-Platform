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
    "invent one. For travel/logistics days (entry_type 'travel'), venue_id is not required. " +
    "tour_id is OPTIONAL — omit it entirely when no tour was mentioned or the show is standalone.",
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
    "Search this band's tours. Omit name to list all tours; pass a partial name to filter. " +
    "Only call this when the user explicitly mentions a tour. Skip entirely for standalone shows " +
    "where no tour was mentioned.",
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Partial tour name to search for. Omit to list all tours.' },
    },
    required: [],
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
    "proposal the user must confirm. If the user mentioned an EXISTING tour, call find_tour first " +
    "and pass tour_id. If the user wants to create a NEW tour at the same time, pass new_tour_name " +
    "instead of tour_id. Tour is always optional — omit both if no tour was mentioned.",
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
      new_tour_name: {
        type: 'string',
        description: 'Create a new tour with this name and attach the show to it. Use INSTEAD OF tour_id when the tour does not exist yet.',
      },
      new_tour_description: { type: 'string' },
      new_tour_start_date:  { type: 'string', description: 'ISO date YYYY-MM-DD.' },
      new_tour_end_date:    { type: 'string', description: 'ISO date YYYY-MM-DD.' },
    },
    required: ['venue_name', 'venue_city', 'venue_state', 'show_date'],
  },
};

export const STAGE_TOUR_INSERT_TOOL = {
  name: 'stage_tour_insert',
  description:
    'Propose creating a new tour. Does NOT write to the database — stages a proposal the user must confirm. ' +
    'Only ask for description, dates, routing_notes, target_regions, cities, or radius if the user volunteered them. ' +
    'name is the only required field.',
  input_schema: {
    type: 'object',
    properties: {
      name:            { type: 'string', description: 'Tour name. Required.' },
      description:     { type: 'string' },
      start_date:      { type: 'string', description: 'ISO date YYYY-MM-DD.' },
      end_date:        { type: 'string', description: 'ISO date YYYY-MM-DD.' },
      routing_notes:   { type: 'string' },
      target_regions:  { type: 'array', items: { type: 'string' } },
      cities:          { type: 'array', items: { type: 'string' } },
      radius:          { type: 'number', description: 'Search radius in miles. Defaults to 10.' },
    },
    required: ['name'],
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

export async function execFindTour(actId: string, name?: string) {
  let query = supabase
    .from('tours')
    .select('id, name, start_date, end_date, status')
    .eq('act_id', actId)
    .limit(5);
  if (name) query = query.ilike('name', `%${name}%`);
  const { data, error } = await query;
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

  // Venue lookup — required for NEW shows, skipped for travel days and for
  // updates to an existing booking (booking_id present) where the venue isn't changing.
  let venueInfo: { name: string; city: string; state: string } | null = null;
  if (entryType !== 'travel' && args.venue_id) {
    const { data: venue, error: venueErr } = await supabase
      .from('venues')
      .select('id, name, city, state')
      .eq('id', args.venue_id)
      .eq('act_id', actId)
      .maybeSingle();
    if (venueErr) throw new Error(`Venue lookup failed: ${venueErr.message}`);
    if (!venue) throw new Error("That venue wasn't found in this band's database.");
    venueInfo = { name: venue.name, city: venue.city, state: venue.state };
  } else if (entryType !== 'travel' && !args.venue_id && !args.booking_id) {
    throw new Error('venue_id is required for new show entries. Call find_venue first.');
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
      .select('id, show_date, venues:venue_id(name, city, state)')
      .eq('id', args.booking_id)
      .eq('act_id', actId)
      .maybeSingle();
    if (existingErr) throw new Error(`Booking lookup failed: ${existingErr.message}`);
    if (!existing) throw new Error("That booking wasn't found for this band.");
    // If no new venue was supplied, use the existing show's venue for display purposes
    // so the confirm card shows real details (e.g. what's actually being cancelled).
    if (!venueInfo && existing.venues) {
      const v = existing.venues as any;
      venueInfo = { name: v.name, city: v.city, state: v.state };
    }
    if (!args.show_date && existing.show_date) {
      args.show_date = existing.show_date;
    }
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
    new_tour_name?: string;
    new_tour_description?: string;
    new_tour_start_date?: string;
    new_tour_end_date?: string;
  }
) {
  if (!args.venue_name?.trim()) throw new Error('venue_name is required.');
  if (!args.venue_city?.trim()) throw new Error('venue_city is required (NOT NULL). Ask the user for the city first.');
  if (!args.venue_state?.trim()) throw new Error('venue_state is required (NOT NULL). Ask the user for the state first.');
  if (args.new_tour_name && args.tour_id) throw new Error('Pass new_tour_name OR tour_id, not both.');

  let tourName: string | null = null;
  if (args.tour_id) {
    const tour = await verifyTourOwnership(actId, args.tour_id);
    tourName = tour.name;
  } else if (args.new_tour_name?.trim()) {
    tourName = args.new_tour_name.trim();
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
    ...(args.new_tour_name?.trim() && { new_tour_name: args.new_tour_name.trim() }),
    ...(args.new_tour_description  && { new_tour_description: args.new_tour_description }),
    ...(args.new_tour_start_date   && { new_tour_start_date: args.new_tour_start_date }),
    ...(args.new_tour_end_date     && { new_tour_end_date: args.new_tour_end_date }),
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

export async function execStageTourInsert(
  actId: string,
  userId: string,
  args: {
    name: string;
    description?: string;
    start_date?: string;
    end_date?: string;
    routing_notes?: string;
    target_regions?: string[];
    cities?: string[];
    radius?: number;
  }
) {
  if (!args.name?.trim()) throw new Error('name is required for a new tour.');

  const payload = {
    name: args.name.trim(),
    status: 'planning',
    ...(args.description             && { description: args.description }),
    ...(args.start_date              && { start_date: args.start_date }),
    ...(args.end_date                && { end_date: args.end_date }),
    ...(args.routing_notes           && { routing_notes: args.routing_notes }),
    ...(args.target_regions?.length  && { target_regions: args.target_regions }),
    ...(args.cities?.length          && { cities: args.cities }),
    ...(args.radius != null          && { radius: args.radius }),
  };

  const { data: staged, error: stageErr } = await supabase
    .from('ai_staged_actions')
    .insert({ act_id: actId, created_by: userId, action_type: 'tour_insert', payload })
    .select()
    .single();
  if (stageErr) throw new Error(`Failed to stage tour proposal: ${stageErr.message}`);

  return {
    action_type: 'tour_insert' as const,
    staged_action_id: staged.id,
    proposal: payload,
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

// ─────────────────────────────────────────────────────────────────────────
// Calendar settings — sync toggle + display name ONLY.
// NEVER read or write google_access_token, google_refresh_token,
// calendar_api_key, or ical_url — those are credentials, not settings, and
// must never pass through the AI agent in either direction.
// ─────────────────────────────────────────────────────────────────────────

export const CALENDAR_SETTINGS_UPDATE_TOOL = {
  name: 'stage_calendar_settings_update',
  description:
    "Propose turning this act's Google Calendar sync on/off, and/or changing its display calendar " +
    "name. Does NOT write to the database — stages a proposal for the user to confirm. Never touches " +
    "credentials or tokens; only sync_enabled and calendar_name are ever read or written.",
  input_schema: {
    type: 'object',
    properties: {
      sync_enabled: { type: 'boolean', description: 'Turn calendar sync on (true) or off (false).' },
      calendar_name: { type: 'string', description: 'Display name for the synced calendar.' },
    },
  },
};

export async function execStageCalendarSettingsUpdate(
  actId: string,
  userId: string,
  args: { sync_enabled?: boolean; calendar_name?: string }
) {
  if (args.sync_enabled === undefined && args.calendar_name === undefined) {
    throw new Error('Nothing to change — specify sync_enabled and/or calendar_name.');
  }

  const { data: current, error: curErr } = await supabase
    .from('acts')
    .select('sync_enabled, calendar_name')
    .eq('id', actId)
    .maybeSingle();
  if (curErr) throw new Error(`Lookup failed: ${curErr.message}`);
  if (!current) throw new Error('Act not found.');

  // Explicit whitelist — only these two fields, ever, regardless of what args contains.
  const payload = {
    sync_enabled: args.sync_enabled !== undefined ? args.sync_enabled : current.sync_enabled,
    calendar_name: args.calendar_name !== undefined ? args.calendar_name : current.calendar_name,
    previous_sync_enabled: current.sync_enabled,
    previous_calendar_name: current.calendar_name,
  };

  const { data: staged, error: stageErr } = await supabase
    .from('ai_staged_actions')
    .insert({ act_id: actId, created_by: userId, action_type: 'calendar_settings_update', payload })
    .select()
    .single();
  if (stageErr) throw new Error(`Failed to stage proposal: ${stageErr.message}`);

  return { action_type: 'calendar_settings_update' as const, staged_action_id: staged.id, proposal: payload, requires_confirmation: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Roster / personnel management — act_personnel only.
// Deliberately excludes act_invitations: inviting someone to actually log
// in and access the platform is a materially bigger action than adding a
// roster entry, and stays a manual, explicit click on the Members page
// (pages/band/members.tsx → "Invite to log in"), not something the AI
// agent ever proposes or executes.
// ─────────────────────────────────────────────────────────────────────────

export const FIND_PERSONNEL_TOOL = {
  name: 'find_personnel',
  description:
    "Search this act's roster by name to get a personnel_id before updating an existing entry. " +
    "Read-only, safe to call freely. Omit when adding someone new.",
  input_schema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
};

export const PERSONNEL_UPSERT_TOOL = {
  name: 'stage_personnel_upsert',
  description:
    "Propose adding a new roster member or updating an existing one's details (role, pay rate, " +
    "contact info, active status). Does NOT write to the database, and does NOT invite anyone to log " +
    "in or grant platform access — that stays a separate manual step on the Members page. Always call " +
    "find_personnel first when updating an existing person.",
  input_schema: {
    type: 'object',
    properties: {
      personnel_id: { type: 'string', description: 'UUID from find_personnel. Omit when adding someone new.' },
      name: { type: 'string' },
      instrument_role: { type: 'string', description: 'e.g. "Guitar", "Drums", "Sound Engineer".' },
      default_pay_amount: { type: 'number' },
      phone: { type: 'string' },
      email: { type: 'string' },
      is_active: { type: 'boolean' },
    },
  },
};

export async function execFindPersonnel(actId: string, name: string) {
  const { data, error } = await supabase
    .from('act_personnel')
    .select('id, name, instrument_role, default_pay_amount, phone, email, is_active')
    .eq('act_id', actId)
    .ilike('name', `%${name}%`)
    .limit(5);
  if (error) throw new Error(`Roster search failed: ${error.message}`);
  return data ?? [];
}

export async function execStagePersonnelUpsert(
  actId: string,
  userId: string,
  args: {
    personnel_id?: string;
    name?: string;
    instrument_role?: string;
    default_pay_amount?: number;
    phone?: string;
    email?: string;
    is_active?: boolean;
  }
) {
  if (args.personnel_id) {
    const { data: existing, error: existErr } = await supabase
      .from('act_personnel')
      .select('id')
      .eq('id', args.personnel_id)
      .eq('act_id', actId)
      .maybeSingle();
    if (existErr) throw new Error(`Lookup failed: ${existErr.message}`);
    if (!existing) throw new Error("That roster entry wasn't found for this band.");
  } else if (!args.name) {
    throw new Error('A name is required when adding a new roster member.');
  }

  const payload = { ...args };

  const { data: staged, error: stageErr } = await supabase
    .from('ai_staged_actions')
    .insert({ act_id: actId, created_by: userId, action_type: 'personnel_upsert', payload })
    .select()
    .single();
  if (stageErr) throw new Error(`Failed to stage proposal: ${stageErr.message}`);

  return { action_type: 'personnel_upsert' as const, staged_action_id: staged.id, proposal: payload, requires_confirmation: true };
}
