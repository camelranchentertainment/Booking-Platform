-- Public storage bucket for act/band images
-- Run in Supabase SQL Editor after creating the "act-images" bucket

-- Public read so images display on the landing page
CREATE POLICY "Public read access for act images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'act-images');

-- Only superadmin/agents can upload act images
CREATE POLICY "Authenticated users can upload act images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'act-images');

CREATE POLICY "Authenticated users can update act images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'act-images');

CREATE POLICY "Authenticated users can delete act images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'act-images');
