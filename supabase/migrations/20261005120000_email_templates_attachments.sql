-- supabase/migrations/20261005120000_email_templates_attachments.sql
-- 1. Email templates become per-band, titled by the user (no category).
-- 2. Close the RLS hole on email_templates.
-- 3. Fix Save Draft (missing email_log.updated_at).
-- 4. Drafts and sent emails remember their attachments.
--
-- Applied by Claude.ai after Scott approves the Supabase prompt. Claude Code never runs this.

-- ── 1. Close the hole ──────────────────────────────────────────────────────
-- "auth_all" (USING true / WITH CHECK true) let every logged-in user read,
-- edit and delete every band's templates. The two user_id policies let a user
-- keep editing templates after leaving a band. Band-admin policies remain.
drop policy if exists "auth_all"                   on public.email_templates;
drop policy if exists "Users see own templates"    on public.email_templates;
drop policy if exists "Users manage own templates" on public.email_templates;

-- Members of the act may read their band's templates; nobody else.
-- (Replaces a policy that also exposed act_id IS NULL rows to every user.)
drop policy if exists "Act members can view templates" on public.email_templates;
create policy "Act members can view templates" on public.email_templates
  for select to authenticated
  using (
    act_id is not null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.act_id = email_templates.act_id
    )
  );

-- ── 2. One template per title per band ─────────────────────────────────────
-- "Save as template" with an existing title replaces it (the app asks first).
-- All existing rows have act_id NULL, so this cannot conflict.
create unique index if not exists email_templates_act_name_key
  on public.email_templates (act_id, lower(name))
  where act_id is not null;

create index if not exists idx_email_templates_act
  on public.email_templates (act_id)
  where act_id is not null;

-- ── 3. Drafts: the missing updated_at column ───────────────────────────────
-- save-draft and the Drafts tab both use email_log.updated_at, which never
-- existed, so every "Save Draft" failed (0 drafts in the table).
alter table public.email_log
  add column if not exists updated_at timestamptz;

-- ── 4. Attachments on drafts and sent emails ───────────────────────────────
-- Array of { source: 'library' | 'upload', id?, path?, name, size, mime }.
-- Files themselves stay in storage; this is the reference list.
alter table public.email_log
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.email_log
  drop constraint if exists email_log_attachments_is_array;
alter table public.email_log
  add constraint email_log_attachments_is_array check (jsonb_typeof(attachments) = 'array');
