// components/public/SectionBackdrop.tsx
//
// A faded, decorative photo that sits behind a home-page section's content.
// The photo is strongest on one side and feathers out toward the other side
// and toward the section's top and bottom edges, so it reads as part of the
// section's background rather than a framed picture, and the text side stays
// readable.
//
// Requirements on the parent (provided by the `.cr-has-backdrop` class rules in
// pages/index.tsx): the section is `position: relative; overflow: hidden` and
// its other children are lifted above the backdrop with `z-index: 1`.

import type { CSSProperties, SyntheticEvent } from 'react';
import {
  backdropSrcSet, backdropUrl,
  type BackdropPhoto, type BackdropSide,
} from '../../lib/homeBackdrops';

interface SectionBackdropProps {
  photo: BackdropPhoto;
  /** Side where the photo is strongest. Defaults to 'right' (text usually sits on the left). */
  side?: BackdropSide;
  /**
   * Opacity at tablet/desktop widths, 0–1. Phones get 70% of this because the
   * text runs full-width there and needs more contrast.
   */
  opacity?: number;
}

// Horizontal fade per side. Black = photo fully visible, transparent = hidden.
const SIDE_MASKS: Readonly<Record<BackdropSide, string>> = {
  right:  'linear-gradient(to left, #000 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.25) 65%, transparent 95%)',
  left:   'linear-gradient(to right, #000 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.25) 65%, transparent 95%)',
  center: 'radial-gradient(ellipse 75% 85% at 50% 50%, #000 0%, rgba(0,0,0,0.6) 50%, transparent 100%)',
};

// Vertical fade so the photo melts into the section borders above and below.
const EDGE_MASK = 'linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)';

const MIN_OPACITY = 0;
const MAX_OPACITY = 0.6; // above this the photo competes with the text

type BackdropStyle = CSSProperties & { '--cr-bd-opacity': number };

/** Hides the photo if the CDN fails, leaving the section's solid background. */
function hideOnError(e: SyntheticEvent<HTMLImageElement>): void {
  e.currentTarget.style.display = 'none';
}

/**
 * Renders a decorative, faded section background photo.
 *
 * The image is marked decorative (alt="", aria-hidden) because it adds mood,
 * not information. It is lazy-loaded, since every section using it is below
 * the fold, and served at the smallest width that fits via srcset.
 */
export default function SectionBackdrop({ photo, side = 'right', opacity = 0.22 }: SectionBackdropProps) {
  const clamped = Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, opacity));
  const mask = `${SIDE_MASKS[side]}, ${EDGE_MASK}`;

  const wrapperStyle: BackdropStyle = { '--cr-bd-opacity': clamped };
  const imgStyle: CSSProperties = {
    objectPosition: photo.focus,
    maskImage: mask,
    WebkitMaskImage: mask,
    // Keep only the area where both masks are visible (side fade AND edge fade).
    maskComposite: 'intersect',
    WebkitMaskComposite: 'source-in',
  };

  return (
    <div className="cr-backdrop" aria-hidden="true" style={wrapperStyle}>
      {/* Plain <img>: next/image would need Unsplash added to remotePatterns and
          adds nothing here — the Unsplash CDN already resizes and serves AVIF/WebP. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="cr-backdrop-img"
        src={backdropUrl(photo.id, 1280)}
        srcSet={backdropSrcSet(photo.id)}
        sizes="100vw"
        alt=""
        loading="lazy"
        decoding="async"
        onError={hideOnError}
        style={imgStyle}
      />
    </div>
  );
}
