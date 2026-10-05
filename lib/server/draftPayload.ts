/** Fields the composer sends when saving a draft. All optional: a draft can be half written. */
export interface DraftInput {
  venueId?: string | null;
  tourVenueId?: string | null;
  bookingId?: string | null;
  contactId?: string | null;
  recipient?: string | null;
  subject?: string | null;
  body?: string | null;
  category?: string | null;
}

/**
 * Builds the email_log row for a saved draft.
 *
 * Deliberately has NO `sent_at`. email_log.sent_at is NOT NULL with a default of
 * now(), so writing `sent_at: null` made every draft save fail at the database.
 * Leaving it out lets an insert take the default and leaves an existing draft's
 * value alone on update. `updated_at` is what tracks when a draft last changed.
 *
 * @param input       the draft fields from the request body
 * @param userId      the authenticated caller
 * @param actId       the caller's own act (from their profile, never the body)
 * @param attachments already-validated attachment list
 * @param now         injectable clock for tests
 */
export function buildDraftPayload<A>(
  input: DraftInput,
  userId: string,
  actId: string,
  attachments: A,
  now: Date = new Date(),
) {
  return {
    sent_by:       userId,
    act_id:        actId,
    venue_id:      input.venueId      || null,
    tour_venue_id: input.tourVenueId  || null,
    booking_id:    input.bookingId    || null,
    contact_id:    input.contactId    || null,
    recipient:     input.recipient    || null,
    subject:       input.subject      || null,
    body:          input.body         || null,
    category:      input.category     || null,
    attachments,
    direction:     'sent' as const,
    status:        'draft' as const,
    is_draft:      true as const,
    updated_at:    now.toISOString(),
  };
}
