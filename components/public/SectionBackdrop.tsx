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
  /** Soft blur in px (0–8) so a photo sets a mood without being recognisable. Defaults to 0. */
  blur?: number;
  /**
   * Load immediately instead of lazily. Only for a backdrop that is visible on
   * first paint (the hero); everything below the fold should stay lazy.
   */
  eager?: boolean;
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
const MAX_BLUR_PX = 8;

type BackdropStyle = CSSProperties & { '--cr-bd-opacity': number };

/** Hides the photo if the CDN fails, leaving the section's solid background. */
function hideOnError(e: SyntheticEvent<HTMLImageElement>): void {
  e.currentTarget.style.display = 'none';
}

/**
 * Renders a decorative, faded section background photo.
 *
 * The image is marked decorative (alt="", aria-hidden) because it adds mood,
 * not information. It is lazy-loaded unless `eager` is set (above-the-fold
 * hero only), and served at the smallest width that fits via srcset.
 */
export default function SectionBackdrop({
  photo, side = 'right', opacity = 0.22, blur = 0, eager = false,
}: SectionBackdropProps) {
  const clamped = Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, opacity));
  const blurPx = Math.min(MAX_BLUR_PX, Math.max(0, blur));
  const mask = `${SIDE_MASKS[side]}, ${EDGE_MASK}`;

  const wrapperStyle: BackdropStyle = { '--cr-bd-opacity': clamped };
  const imgStyle: CSSProperties = {
    objectPosition: photo.focus,
    maskImage: mask,
    WebkitMaskImage: mask,
    // Keep only the area where both masks are visible (side fade AND edge fade).
    maskComposite: 'intersect',
    WebkitMaskComposite: 'source-in',
    // Blur is appended to the shared colour treatment from .cr-backdrop-img, and
    // the image is scaled up slightly so blurred edges never show a halo.
    ...(blurPx > 0 && {
      filter: `grayscale(30%) sepia(35%) saturate(90%) contrast(1.05) blur(${blurPx}px)`,
      transform: 'scale(1.04)',
    }),
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
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onError={hideOnError}
        style={imgStyle}
      />
    </div>
  );
}
