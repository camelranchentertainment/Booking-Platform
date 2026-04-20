-- Fix: infinite recursion in acts RLS policy
-- Root cause: acts policy queries agent_act_links, whose policy queries acts — cycle.
-- Solution: SECURITY DEFINER function reads agent_act_links bypassing its RLS,
--           so the acts policy never re-triggers agent_act_links RLS.
--
-- Run this in: Supabase dashboard → SQL Editor → New query → Run

-- ── 1. Helper: check linked-agent status without triggering RLS cycle ──────────
CREATE OR REPLACE FUNCTION is_linked_agent_for_act(p_act_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER   -- runs as function owner, bypasses RLS on agent_act_links
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agent_act_links
    WHERE act_id    = p_act_id
    AND   agent_id  = auth.uid()
    AND   status    = 'active'
  );
$$;

-- ── 2. Drop old acts policies (any name they may have been created with) ────────
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'acts' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON acts', r.policyname);
  END LOOP;
END $$;

-- ── 3. Recreate acts policies — no direct reference to agent_act_links ──────────
ALTER TABLE acts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acts_select" ON acts FOR SELECT TO authenticated
  USING (
    agent_id = auth.uid()
    OR owner_id = auth.uid()
    OR is_linked_agent_for_act(id)
  );

CREATE POLICY "acts_insert" ON acts FOR INSERT TO authenticated
  WITH CHECK (
    agent_id = auth.uid()
    OR owner_id = auth.uid()
  );

CREATE POLICY "acts_update" ON acts FOR UPDATE TO authenticated
  USING (
    agent_id = auth.uid()
    OR owner_id = auth.uid()
    OR is_linked_agent_for_act(id)
  );

CREATE POLICY "acts_delete" ON acts FOR DELETE TO authenticated
  USING (
    agent_id = auth.uid()
    OR owner_id = auth.uid()
  );

-- ── 4. Fix agent_act_links policies — reference acts directly (safe now) ────────
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'agent_act_links' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON agent_act_links', r.policyname);
  END LOOP;
END $$;

ALTER TABLE agent_act_links ENABLE ROW LEVEL SECURITY;

-- Agent sees their own links; act owner sees links for their act
CREATE POLICY "agent_act_links_select" ON agent_act_links FOR SELECT TO authenticated
  USING (
    agent_id = auth.uid()
    OR act_id IN (SELECT id FROM acts WHERE owner_id = auth.uid())
  );

-- Only the agent who sent the link can insert
CREATE POLICY "agent_act_links_insert" ON agent_act_links FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid());

-- Agent or act owner can update (accept/decline/revoke)
CREATE POLICY "agent_act_links_update" ON agent_act_links FOR UPDATE TO authenticated
  USING (
    agent_id = auth.uid()
    OR act_id IN (SELECT id FROM acts WHERE owner_id = auth.uid())
  );

CREATE POLICY "agent_act_links_delete" ON agent_act_links FOR DELETE TO authenticated
  USING (
    agent_id = auth.uid()
    OR act_id IN (SELECT id FROM acts WHERE owner_id = auth.uid())
  );
