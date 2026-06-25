ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS rating     integer CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS attendance integer CHECK (attendance >= 0);
