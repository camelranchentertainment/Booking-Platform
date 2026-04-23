-- Allow act owners (band admins) to read venues belonging to their booking agent
-- This lets a band admin search the agent's venue pool when adding a one-off show.
-- Run in Supabase SQL Editor.

DO $$ BEGIN
  CREATE POLICY "venues_act_owner_select" ON venues FOR SELECT USING (
    agent_id IN (
      SELECT a.agent_id FROM acts a
      WHERE a.owner_id = auth.uid() AND a.agent_id IS NOT NULL
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
