-- Migration: Add is_draft column to email_log table
-- Review before running in Supabase SQL editor

ALTER TABLE email_log ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_email_log_drafts ON email_log(act_id, is_draft) WHERE is_draft = true;

-- Step 5: Remove duplicate email_templates (keep oldest per name+act_id)
-- DELETE FROM email_templates
-- WHERE id IN (
--   SELECT id FROM (
--     SELECT id, ROW_NUMBER() OVER (PARTITION BY name, act_id ORDER BY created_at) as rn
--     FROM email_templates
--   ) t WHERE rn > 1
-- );

-- Update old variable names in existing templates
-- UPDATE email_templates SET body = REPLACE(body, '{{agent_name}}', '{{display_name}}');
-- UPDATE email_templates SET body = REPLACE(body, '{{agency_name}}', '{{band_name}}');
