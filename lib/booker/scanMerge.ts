// lib/booker/scanMerge.ts
// Decides what a website scan may change. Pure functions, unit-tested.
//
// Rule: a scan only fills blanks. Anything the agent typed is never
// overwritten, and a contact already on the venue is never duplicated.

export interface ScanFindings {
  booking_email: string | null;
  general_email: string | null;
  booking_phone: string | null;
  booking_contact_name: string | null;
  booking_contact_title: string | null;
  capacity: number | null;
  notes: string | null;
}

export interface VenueBlanks {
  email: string | null;
  phone: string | null;
  capacity: number | null;
  notes: string | null;
}

export interface VenuePatch {
  email?: string;
  phone?: string;
  capacity?: number;
  notes?: string;
}

/** Venue fields to fill from a scan; only empty fields are included. */
export function venuePatchFromScan(venue: VenueBlanks, found: ScanFindings): VenuePatch {
  const patch: VenuePatch = {};
  const email = found.booking_email ?? found.general_email;
  if (!venue.email && email) patch.email = email;
  if (!venue.phone && found.booking_phone) patch.phone = found.booking_phone;
  if (venue.capacity === null && found.capacity !== null) patch.capacity = found.capacity;
  if (!venue.notes && found.notes) patch.notes = found.notes;
  return patch;
}

export interface ExistingContact {
  name: string;
  email: string | null;
}

export interface NewContact {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * The contact a scan should add to the venue, or null when the site named no
 * one or that person (same name or same email) is already on the venue.
 */
export function contactFromScan(found: ScanFindings, existing: readonly ExistingContact[]): NewContact | null {
  const name = found.booking_contact_name?.trim();
  if (!name) return null;
  const email = found.booking_email ?? found.general_email;
  const lowerName = name.toLowerCase();
  const duplicate = existing.some(c => c.name.trim().toLowerCase() === lowerName || (email !== null && c.email?.toLowerCase() === email.toLowerCase()));
  if (duplicate) return null;
  return { name, title: found.booking_contact_title, email, phone: found.booking_phone };
}
