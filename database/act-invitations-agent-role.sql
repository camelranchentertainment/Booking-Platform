-- Allow 'agent' as an invite role in act_invitations
-- Run in Supabase SQL Editor

ALTER TABLE act_invitations DROP CONSTRAINT IF EXISTS act_invitations_role_check;

ALTER TABLE act_invitations ADD CONSTRAINT act_invitations_role_check
  CHECK (role IN ('act_admin', 'member', 'agent'));
