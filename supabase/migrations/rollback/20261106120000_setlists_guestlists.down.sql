-- rollback/20261106120000_setlists_guestlists.down.sql
--
-- Undoes 20261106120000_setlists_guestlists.sql. Deletes every song, set list
-- and guest list entry. Only run if the feature is being removed entirely.

begin;

drop function if exists public.publish_set_list(uuid);
drop function if exists public.save_set_list_items(uuid, jsonb);

drop table if exists public.guest_list_entries;
drop table if exists public.set_list_items;
drop table if exists public.set_lists;
drop table if exists public.songs;

drop function if exists public.guest_list_entries_before_write();
drop function if exists public.guest_list_member_can_edit(uuid);
drop function if exists public.set_list_items_validate();
drop function if exists public.set_lists_validate();
drop function if exists public.app_is_act_admin(uuid);
drop function if exists public.crb_touch_updated_at();

alter table public.bookings
  drop column if exists guest_list_limit_per_member,
  drop column if exists guest_list_locked_at;

commit;
