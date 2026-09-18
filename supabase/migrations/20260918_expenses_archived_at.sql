-- Agent permissions: expenses soft-delete via archived_at
-- The AI agent never issues a hard DELETE on expenses — it archives instead.
-- Archived records are excluded from normal views but stay in the database.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- act_id was missing from the original CREATE TABLE but is inserted by execute.ts;
-- add it here so it is formally part of the schema and can be indexed.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS act_id UUID REFERENCES acts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_act_id       ON expenses(act_id);
CREATE INDEX IF NOT EXISTS idx_expenses_archived_at  ON expenses(archived_at);
