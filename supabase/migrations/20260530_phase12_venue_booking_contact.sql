-- Phase 12: add booking_contact field to venues table
ALTER TABLE venues ADD COLUMN IF NOT EXISTS booking_contact TEXT;

NOTIFY pgrst, 'reload schema';
