-- Allow act owners (band admins) to upload/update their band logo in the avatars bucket.
-- Path format used by the app: act-{act_uuid}.{ext}
-- Run in Supabase SQL Editor.

-- INSERT (new upload)
DO $$ BEGIN
  CREATE POLICY "Act owners can upload act logo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND name LIKE 'act-%'
    AND split_part(substring(name FROM 5), '.', 1) IN (
      SELECT id::text FROM acts WHERE owner_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- UPDATE (replace / upsert)
DO $$ BEGIN
  CREATE POLICY "Act owners can update act logo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name LIKE 'act-%'
    AND split_part(substring(name FROM 5), '.', 1) IN (
      SELECT id::text FROM acts WHERE owner_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DELETE
DO $$ BEGIN
  CREATE POLICY "Act owners can delete act logo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name LIKE 'act-%'
    AND split_part(substring(name FROM 5), '.', 1) IN (
      SELECT id::text FROM acts WHERE owner_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
