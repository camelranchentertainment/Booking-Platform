// __tests__/lib/publicActPhoto.test.ts
import { pickActPhoto } from '../../lib/publicActPhoto';

const PHOTO = 'https://example.supabase.co/storage/v1/object/public/avatars/act-1.jpg?t=1';
const LOGO  = 'https://example.supabase.co/storage/v1/object/public/avatars/act-logos/1/logo.jpg';

describe('pickActPhoto', () => {
  it('prefers the band profile photo over the logo', () => {
    expect(pickActPhoto({ profile_photo_url: PHOTO, logo_url: LOGO })).toBe(PHOTO);
  });

  it('falls back to the logo when there is no profile photo', () => {
    expect(pickActPhoto({ profile_photo_url: null, logo_url: LOGO })).toBe(LOGO);
    expect(pickActPhoto({ profile_photo_url: '   ', logo_url: LOGO })).toBe(LOGO);
  });

  it('returns null when the band has neither image', () => {
    expect(pickActPhoto({ profile_photo_url: null, logo_url: null })).toBeNull();
  });

  it('rejects non-https or malformed URLs and moves on to the next option', () => {
    expect(pickActPhoto({ profile_photo_url: 'javascript:alert(1)', logo_url: LOGO })).toBe(LOGO);
    expect(pickActPhoto({ profile_photo_url: 'http://insecure.example/a.jpg', logo_url: null })).toBeNull();
    expect(pickActPhoto({ profile_photo_url: 'not a url', logo_url: null })).toBeNull();
  });
});
