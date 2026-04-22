-- Update social links for Jake Stringer & Better Than Nothing and John D Hale Band
-- Run in Supabase SQL Editor

UPDATE acts
SET
  spotify  = 'https://open.spotify.com/artist/0hw6KNerkTNRER7apCyZf4'
  -- logo_url: go to https://open.spotify.com/artist/0hw6KNerkTNRER7apCyZf4
  --   right-click the artist photo → "Copy image address" → paste below
  -- logo_url = 'PASTE_SPOTIFY_IMAGE_URL_HERE'
WHERE act_name ILIKE '%Jake Stringer%'
   OR act_name ILIKE '%Better Than Nothing%';

UPDATE acts
SET
  instagram = 'https://x.com/JohnDHale'
  -- logo_url: go to https://x.com/JohnDHale
  --   click the profile photo → right-click → "Copy image address" → paste below
  -- logo_url = 'PASTE_TWITTER_IMAGE_URL_HERE'
WHERE act_name = 'John D Hale Band';

-- Once you have the image URLs, uncomment and run:
-- UPDATE acts SET logo_url = 'URL_HERE' WHERE act_name ILIKE '%Jake Stringer%';
-- UPDATE acts SET logo_url = 'URL_HERE' WHERE act_name = 'John D Hale Band';
