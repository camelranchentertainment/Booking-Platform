-- Allow act_admin users to manage invitations for their linked act.
-- Covers band admins who are linked via user_profiles.act_id but are not
-- the acts.owner_id (e.g. acts created by an agent on behalf of a band).
-- Run in Supabase SQL Editor.

DO $$ BEGIN
  CREATE POLICY "invitations_act_admin"
  ON act_invitations FOR ALL
  USING (
    act_id IN (
      SELECT act_id FROM user_profiles
      WHERE id = auth.uid() AND role = 'act_admin' AND act_id IS NOT NULL
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
