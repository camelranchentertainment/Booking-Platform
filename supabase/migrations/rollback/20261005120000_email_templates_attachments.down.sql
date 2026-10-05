-- supabase/migrations/rollback/20261005120000_email_templates_attachments.down.sql
-- Run only after the matching code has been reverted.
-- Deliberately does NOT restore the "auth_all" policy (that was the security hole).
alter table public.email_log drop constraint if exists email_log_attachments_is_array;
alter table public.email_log drop column if exists attachments;
alter table public.email_log drop column if exists updated_at;
drop index if exists public.idx_email_templates_act;
drop index if exists public.email_templates_act_name_key;
drop policy if exists "Act members can view templates" on public.email_templates;
create policy "Act members can view templates" on public.email_templates
  for select to authenticated
  using ((act_id is null) or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.act_id = email_templates.act_id
  ));
