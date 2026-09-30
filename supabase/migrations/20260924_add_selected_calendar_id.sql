-- Align user_calendar_settings with Google Calendar sync code.

alter table public.user_calendar_settings
  add column if not exists selected_calendar_id text;

-- Preserve an existing calendar selection if google_calendar_id was
-- previously being used.
update public.user_calendar_settings
set selected_calendar_id = google_calendar_id
where selected_calendar_id is null
  and google_calendar_id is not null;