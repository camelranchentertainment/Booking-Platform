// components/layout/PageHero.tsx
//
// Illustrated page header shared by the redesigned pages (Today, Venues, …).
// It is the same frame as the Tours page header (components/tours/TourHighwayHero.tsx):
// a full-bleed inline-SVG scene behind a big Bebas title, a tracked uppercase
// subtitle, an optional status line and right-side actions. The styles are the
// Tours hero rules, shared via the `.page-hero*` selectors in styles/globals.css,
// so every page header reads as one family.
//
// Each page supplies its own `scene` (an aria-hidden <svg className="page-hero-art">).
// Scenes are illustration paint, so their colours are literal hex values; the
// copy laid over them uses design-system variables.

import type { ReactNode } from 'react';

export interface PageHeroProps {
  title: string;
  subtitle: string;
  /** One-line status under the subtitle. Announced politely when it changes (it is filled in after data loads). */
  summary?: ReactNode;
  /** Right-side actions (primary button, links). */
  actions?: ReactNode;
  /** The decorative illustration. Must be aria-hidden; it carries no information. */
  scene: ReactNode;
}

/** Illustrated page header in the Tours style. */
export default function PageHero({ title, subtitle, summary, actions, scene }: PageHeroProps) {
  return (
    <header className="page-hero">
      {scene}
      <div className="page-hero-content">
        <div className="page-hero-text">
          <h1 className="page-hero-title">{title}</h1>
          <p className="page-hero-sub">{subtitle}</p>
          <p className="page-hero-summary" aria-live="polite">{summary ?? ' '}</p>
        </div>
        {actions && <div className="page-hero-actions">{actions}</div>}
      </div>
    </header>
  );
}
