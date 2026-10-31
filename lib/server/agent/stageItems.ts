// lib/server/agent/stageItems.ts
//
// Stages shows, travel days, tour notes and expenses from a list of items:
// resolves the tour and each venue by name, refuses duplicates, and writes one
// pending ai_staged_actions row per item for the user to confirm. Moved out of
// pages/api/agent.ts unchanged so the classic agent and the tool-based agent
// share it.

import type { getServiceClient } from '../../supabase';
import {
  execFindVenue,
  execFindTour,
  execStageBookingUpsert,
  execStageTourNotesUpdate,
  execStageExpense,
  execStageVenueAndBooking,
} from '../../aiAgentTools';
import {
  StageItem,
  normalizeItemKey,
  isDuplicateInRows,
  isStandaloneTourName,
  normaliseBookingStatus,
} from '../../agentStagingHelpers';

export async function resolveStageItems(
  actId: string,
  userId: string,
  tourName: string,
  items: StageItem[],
  service: ReturnType<typeof getServiceClient>,
  dedupRows: { pending: any[]; recent: any[] },
): Promise<{ staged: any[]; errors: string[] }> {
  // A show doesn't have to belong to a tour. Standalone shows (no tourName)
  // stage with no tour_id; tour notes and expenses still need a tour.
  let tour: { id: string; name: string } | null = null;
  if (!isStandaloneTourName(tourName)) {
    const tours = await execFindTour(actId, tourName);
    tour = tours[0] ?? null;
    if (!tour) {
      return { staged: [], errors: [`No tour found matching "${tourName}". Say "standalone" to save it without a tour, or create the tour first.`] };
    }
  }

  const staged: any[] = [];
  const errors: string[] = [];
  const batchKeys = new Set<string>(); // track keys staged in this batch to catch within-batch duplicates

  for (const item of items) {
    try {
      if (item.kind === 'show' || item.kind === 'travel') {
        let venue_id: string | undefined;
        if (item.kind === 'show' && !item.booking_id) {
          if (!item.venueName) { errors.push('A show item is missing a venue name.'); continue; }
          const venues = await execFindVenue(actId, { name: item.venueName, city: item.venueCity });
          if (!venues.length) {
            if (item.venueCity && item.venueState) {
              const candidateKey = normalizeItemKey('venue_and_booking_upsert', {
                venue_name: item.venueName, show_date: item.date ?? '',
              });
              if (batchKeys.has(candidateKey)) {
                errors.push(`Already staged in this batch: ${item.venueName} on ${item.date}`);
                continue;
              }
              const dup = isDuplicateInRows(dedupRows.pending, dedupRows.recent, 'venue_and_booking_upsert', {
                venue_name: item.venueName, show_date: item.date ?? '',
              });
              if (dup.duplicate) {
                errors.push(dup.reason === 'pending'
                  ? `Already waiting for confirmation: ${item.venueName} on ${item.date}`
                  : `Already saved recently: ${item.venueName} on ${item.date}`);
                continue;
              }
              try {
                const result = await execStageVenueAndBooking(actId, userId, {
                  venue_name: item.venueName,
                  venue_city: item.venueCity,
                  venue_state: item.venueState,
                  venue_address: item.venueAddress,
                  venue_zip: item.venueZip,
                  venue_phone: item.venuePhone,
                  venue_email: item.venueEmail,
                  venue_website: item.venueWebsite,
                  show_date: item.date || '',
                  entry_type: 'show',
                  // The user's stated status was being dropped here, so a show
                  // they called "confirmed" was saved as a hold.
                  status: normaliseBookingStatus(item.status) ?? 'confirmed',
                  set_time: item.setTime,
                  load_in_time: item.loadInTime,
                  soundcheck_time: item.soundcheckTime,
                  end_time: item.endTime,
                  notes: item.notes,
                  ...(tour ? { tour_id: tour.id } : {}),
                });
                batchKeys.add(candidateKey);
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
        if (!item.date && !item.booking_id) { errors.push('A date is required for every show/travel item.'); continue; }

        const candidateKey = normalizeItemKey('booking_upsert', {
          booking_id: item.booking_id ?? '', venue_id: venue_id ?? '', show_date: item.date ?? '',
        });
        if (batchKeys.has(candidateKey)) {
          errors.push(`Already staged in this batch: ${item.date} at ${item.venueName ?? 'venue'}`);
          continue;
        }
        const dup = isDuplicateInRows(dedupRows.pending, dedupRows.recent, 'booking_upsert', {
          booking_id: item.booking_id ?? '', venue_id: venue_id ?? '', show_date: item.date ?? '',
        });
        if (dup.duplicate) {
          errors.push(dup.reason === 'pending'
            ? `Already waiting for confirmation: ${item.date} at ${item.venueName ?? 'venue'}`
            : `Already saved recently: ${item.date} at ${item.venueName ?? 'venue'}`);
          continue;
        }

        const result = await execStageBookingUpsert(actId, userId, {
          booking_id: item.booking_id,
          venue_id,
          show_date: item.date || '',
          // Don't default status on updates — only set it when explicitly provided or creating new
          ...(normaliseBookingStatus(item.status)
            ? { status: normaliseBookingStatus(item.status) }
            : !item.booking_id ? { status: 'confirmed' } : {}),
          entry_type: item.kind === 'travel' ? 'travel' : 'show',
          load_in_time: item.loadInTime,
          set_time: item.setTime,
          soundcheck_time: item.soundcheckTime,
          end_time: item.endTime,
          notes: item.notes,
          // Updating an existing show without naming a tour must not unlink it,
          // so tour_id is only sent when a tour was named.
          ...(tour ? { tour_id: tour.id } : {}),
        });
        batchKeys.add(candidateKey);
        staged.push({ kind: item.kind, ...result });
      } else if (item.kind === 'tour_notes') {
        if (!tour) { errors.push('Tour notes need a tour — which tour should they go on?'); continue; }
        if (!item.notes) { errors.push('Tour notes item has no text.'); continue; }
        const candidateKey = normalizeItemKey('tour_notes_update', { tour_id: tour.id });
        if (batchKeys.has(candidateKey)) {
          errors.push('Tour notes already updated in this batch.');
          continue;
        }
        const dup = isDuplicateInRows(dedupRows.pending, dedupRows.recent, 'tour_notes_update', { tour_id: tour.id });
        if (dup.duplicate) {
          errors.push(dup.reason === 'recent' ? 'Tour notes already saved recently.' : 'Tour notes update already waiting for confirmation.');
          continue;
        }
        const result = await execStageTourNotesUpdate(actId, userId, { tour_id: tour.id, notes: item.notes });
        batchKeys.add(candidateKey);
        staged.push({ kind: 'tour_notes', ...result });
      } else if (item.kind === 'expense') {
        if (!tour) { errors.push('Expenses need a tour — which tour is this expense for?'); continue; }
        if (!item.category || item.amount == null || !item.date) {
          errors.push('An expense item is missing category, amount, or date.');
          continue;
        }
        const candidateKey = normalizeItemKey('expense_insert', {
          tour_id: tour.id, category: item.category, amount: item.amount, expense_date: item.date,
        });
        if (batchKeys.has(candidateKey)) {
          errors.push(`Duplicate expense in this batch: ${item.category} $${item.amount}`);
          continue;
        }
        const dup = isDuplicateInRows(dedupRows.pending, dedupRows.recent, 'expense_insert', {
          tour_id: tour.id, category: item.category, amount: item.amount, expense_date: item.date,
        });
        if (dup.duplicate) {
          errors.push(dup.reason === 'recent'
            ? `Expense already saved recently: ${item.category} $${item.amount}`
            : `Expense already waiting for confirmation: ${item.category} $${item.amount}`);
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
        batchKeys.add(candidateKey);
        staged.push({ kind: 'expense', ...result });
      } else {
        // Unknown kind — report it rather than silently dropping
        errors.push(`Unknown item kind "${(item as any).kind}" — item not staged.`);
      }
    } catch (e: any) {
      errors.push(e.message || 'Failed to stage an item.');
    }
  }

  return { staged, errors };
}
