// lib/homeBackdrops.ts
//
// Background photos for the public home page sections (pages/index.tsx).
//
// All photos are from Unsplash and are used under the Unsplash License
// (free for commercial use, no attribution required). Photographer and source
// page are kept here anyway so credit is easy to give and any photo is easy to
// trace or swap. Images are served from Unsplash's image CDN (the same way the
// hero photo already is), which resizes and re-encodes on the fly — so we ask
// for a few widths and let the browser pick via srcset.
//
// Photos were picked to avoid visible brand logos where possible and to match
// what each section talks about.

/** Which side of the section the photo is strongest on (it fades out toward the other side). */
export type BackdropSide = 'left' | 'right' | 'center';

export interface BackdropPhoto {
  /** Unsplash CDN photo id, e.g. "photo-1566699270403-3f7e3f340664". */
  id: string;
  /** Short description for maintainers (the image itself is decorative, alt=""). */
  subject: string;
  photographer: string;
  sourceUrl: string;
  /** CSS object-position — keeps the interesting part of the photo in frame when cropped. */
  focus: string;
}

export type HomeSectionKey = 'problem' | 'agent' | 'features' | 'artists' | 'pricing' | 'signup';

export const HOME_BACKDROPS: Readonly<Record<HomeSectionKey, BackdropPhoto>> = {
  // "Disorganization Costs You Shows" — a desk buried in paper.
  problem: {
    id: 'photo-1566699270403-3f7e3f340664',
    subject: 'Cluttered office desk piled with papers',
    photographer: 'Wonderlane',
    sourceUrl: 'https://unsplash.com/photos/office-table-with-pile-of-papers-6jA6eVsRJ6Q',
    focus: '30% 50%',
  },
  // "Your AI Booking Agent" — a musician working from a laptop.
  agent: {
    id: 'photo-1593697972646-2f348871bd56',
    subject: 'Musician with guitar and keyboard working on a laptop',
    photographer: 'Soundtrap',
    sourceUrl: 'https://unsplash.com/photos/man-in-gray-t-shirt-playing-guitar-GZ56k0qTuc0',
    focus: '60% 45%',
  },
  // "Everything You Need To Run Your Career" — tour van on the road.
  features: {
    id: 'photo-1613750590555-5ad35bd95a99',
    subject: 'White tour van on a desert canyon road',
    photographer: 'Bradley Dunn',
    sourceUrl: 'https://unsplash.com/photos/gray-volkswagen-golf-on-brown-dirt-road-during-daytime-hI11J9TlBUE',
    focus: '55% 60%',
  },
  // "Artists Growing With This Platform" — a packed room in front of a band.
  artists: {
    id: 'photo-1524368535928-5b5e00ddc76b',
    subject: 'Crowd with hands up in front of a lit stage',
    photographer: 'Vishnu R Nair',
    sourceUrl: 'https://unsplash.com/photos/band-performing-on-stage-in-front-of-people-m1WZS5ye404',
    focus: '50% 40%',
  },
  // "Simple, Honest Pricing" — road cases on stage: gear ready to work.
  pricing: {
    id: 'photo-1760092190058-19a99ead47b8',
    subject: 'Road case on a stage under blue lights',
    photographer: 'Vitalii Onyshchuk',
    sourceUrl: 'https://unsplash.com/photos/black-equipment-case-on-a-stage-with-blue-lights-7FdoFvG285E',
    focus: '50% 60%',
  },
  // "Stop Losing Gigs To Disorganization" — an empty mic in a spotlight, waiting for you.
  signup: {
    id: 'photo-1453090927415-5f45085b65c0',
    subject: 'Microphone on a stand in a spotlight',
    photographer: 'Oscar Keys',
    sourceUrl: 'https://unsplash.com/photos/photo-of-microphone-on-foggy-stage-ojVMh1QTVGY',
    focus: '50% 50%',
  },
};

/** Widths offered in srcset. Backdrops are faded, so 1920 is plenty even on large screens. */
export const BACKDROP_WIDTHS: readonly number[] = [640, 960, 1280, 1920];

// Low-opacity backgrounds don't need high JPEG quality; this keeps each request small.
const BACKDROP_QUALITY = 60;

const PHOTO_ID_PATTERN = /^photo-[0-9]+-[0-9a-f]+$/;

/**
 * Builds a sized Unsplash CDN URL for a photo.
 *
 * @param id    Unsplash photo id ("photo-<digits>-<hex>")
 * @param width Requested pixel width (positive integer)
 * @returns     HTTPS URL that returns a cropped, auto-format image at that width
 * @throws      Error if the id or width is malformed — fails loudly in tests rather than shipping a broken image
 */
export function backdropUrl(id: string, width: number): string {
  if (!PHOTO_ID_PATTERN.test(id)) throw new Error(`Invalid Unsplash photo id: ${id}`);
  if (!Number.isInteger(width) || width <= 0) throw new Error(`Invalid backdrop width: ${width}`);
  const params = new URLSearchParams({
    auto: 'format',
    fit: 'crop',
    w: String(width),
    q: String(BACKDROP_QUALITY),
  });
  return `https://images.unsplash.com/${id}?${params.toString()}`;
}

/**
 * Builds the srcset string for a photo across BACKDROP_WIDTHS.
 *
 * @param id Unsplash photo id
 * @returns  e.g. "https://…?w=640… 640w, https://…?w=960… 960w, …"
 */
export function backdropSrcSet(id: string): string {
  return BACKDROP_WIDTHS.map(w => `${backdropUrl(id, w)} ${w}w`).join(', ');
}
