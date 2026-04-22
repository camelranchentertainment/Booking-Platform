-- Storage RLS policies for the avatars bucket
-- Run this in Supabase SQL Editor

-- Allow authenticated users to upload/replace their own avatar
-- (filename is {user_id}.{ext} so we verify the name starts with their uid)
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND split_part(name, '.', 1) = auth.uid()::text
);

-- Allow authenticated users to update (overwrite) their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND split_part(name, '.', 1) = auth.uid()::text
);

-- Allow public read so avatars display everywhere
CREATE POLICY "Public read access for avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Allow users to delete their own avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND split_part(name, '.', 1) = auth.uid()::text
);
