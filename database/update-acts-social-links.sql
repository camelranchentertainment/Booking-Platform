-- Update social links and images for Jake Stringer & Better Than Nothing and John D Hale Band
-- Run in Supabase SQL Editor

UPDATE acts
SET
  spotify   = 'https://open.spotify.com/artist/0hw6KNerkTNRER7apCyZf4',
  logo_url  = 'https://ffnhrwfkiryohocscthu.supabase.co/storage/v1/object/public/act-images/meta_eyJzcmNCdWNrZXQiOiJiemdsZmlsZXMifQ==.webp'
WHERE act_name ILIKE '%Jake Stringer%'
   OR act_name ILIKE '%Better Than Nothing%';

UPDATE acts
SET
  instagram = 'https://x.com/JohnDHale',
  logo_url  = 'https://ffnhrwfkiryohocscthu.supabase.co/storage/v1/object/public/act-images/50027906_10157161279542754_74258425474711552_n.jpg'
WHERE act_name = 'John D Hale Band';
