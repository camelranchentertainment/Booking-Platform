// lib/publicActPhoto.ts
//
// Chooses which image represents a band on public pages (the home page
// Artist Spotlight). A band's profile photo is the picture of the band itself,
// so it wins; the logo is the fallback for bands that only uploaded a logo.

export interface ActImageFields {
  profile_photo_url: string | null;
  logo_url: string | null;
}

/**
 * Returns a usable https URL for an image, or null.
 * Rejects empty strings and any non-https scheme (e.g. `javascript:` or
 * `data:`), because the value is user-supplied and goes straight into an
 * <img src> on a public page.
 */
function safeImageUrl(raw: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Picks the photo shown for a band on public pages.
 *
 * @param act The band's profile photo and logo URLs, either of which may be null
 * @returns   The profile photo URL, else the logo URL, else null when the band has neither
 */
export function pickActPhoto(act: ActImageFields): string | null {
  return safeImageUrl(act.profile_photo_url) ?? safeImageUrl(act.logo_url);
}
