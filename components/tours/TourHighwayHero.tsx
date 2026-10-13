// components/tours/TourHighwayHero.tsx
//
// Header band for the Tours page: an illustrated desert highway at sunset
// with a luxury entertainer coach rolling across it, and the page title and
// actions laid over the left side.
//
// The scene is an inline SVG rather than a photo so it costs no network
// request, can't break if a CDN is down, and stays crisp at any width.
// The scene's colours are illustration paint, not UI tokens, so they are
// literal hex values on purpose; everything laid over the scene (text,
// buttons) uses the design-system variables via the `.tours-hero*` classes
// in styles/globals.css. The gradient ids are prefixed so they can't clash
// with another SVG on the page.

import type { ReactNode } from 'react';

interface TourHighwayHeroProps {
  title: string;
  subtitle: string;
  /** One-line status under the subtitle, e.g. "8 runs on the books…". */
  summary?: ReactNode;
  /** Right-side actions (the "+ New Tour" button). */
  actions?: ReactNode;
}

const DASH_XS = Array.from({ length: 16 }, (_, i) => i * 90);

/** The decorative scene. aria-hidden: it carries no information. */
function HighwayScene() {
  return (
    <svg
      className="tours-hero-art"
      viewBox="0 0 1440 340"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="crTourSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1B2547" />
          <stop offset="0.45" stopColor="#6B3A4E" />
          <stop offset="0.75" stopColor="#C8573A" />
          <stop offset="1" stopColor="#F09A4E" />
        </linearGradient>
        {/* Darkens the left side so the title reads over the sky. */}
        <linearGradient id="crTourShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.92" />
          <stop offset="0.45" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        {/* Melts the bottom edge into the page background (--bg). */}
        <linearGradient id="crTourFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crTourSky)" />
      <circle cx="1080" cy="196" r="84" fill="#F7C46A" opacity="0.18" />
      <circle cx="1080" cy="196" r="58" fill="#F7C46A" />

      {/* Far mesas, then near buttes */}
      <path d="M0 214 L120 214 L140 188 L310 188 L332 214 L560 214 L590 170 L700 170 L726 206 L900 206 L930 182 L1150 182 L1176 210 L1300 210 L1322 192 L1440 192 L1440 260 L0 260 Z" fill="#7A3B45" />
      <path d="M0 238 L220 238 L240 214 L268 214 L276 196 L300 196 L310 214 L360 214 L380 238 L780 238 L800 222 L960 222 L978 238 L1180 238 L1196 204 L1214 204 L1222 186 L1262 186 L1270 204 L1300 204 L1318 238 L1440 238 L1440 272 L0 272 Z" fill="#4A2638" />

      {/* Desert floor and highway */}
      <rect y="256" width="1440" height="84" fill="#2A1C2E" />
      <rect y="270" width="1440" height="40" fill="#151A2B" />
      <rect y="270" width="1440" height="2" fill="#3A3048" />
      <g fill="#F5C46A">
        {DASH_XS.map(x => <rect key={x} x={x} y="289" width="44" height="3" />)}
      </g>

      {/* Saguaros */}
      <g fill="#1A1222">
        <path d="M640 270 L640 206 Q640 198 648 198 Q656 198 656 206 L656 270 Z" />
        <path d="M640 240 L628 240 Q620 240 620 232 L620 218 Q620 212 626 212 Q632 212 632 218 L632 230 L640 230 Z" />
        <path d="M656 228 L668 228 L668 212 Q668 206 674 206 Q680 206 680 212 L680 230 Q680 238 672 238 L656 238 Z" />
        <path d="M1352 270 L1352 222 Q1352 216 1358 216 Q1364 216 1364 222 L1364 270 Z" />
        <path d="M1364 244 L1374 244 L1374 232 Q1374 227 1379 227 Q1384 227 1384 232 L1384 246 Q1384 252 1378 252 L1364 252 Z" />
      </g>

      {/* Entertainer coach: raked windshield, tinted window band, swoosh
          graphic, bug-eye mirror, and three axles (steer, drive, tag). */}
      <g transform="translate(820 204)">
        <ellipse cx="180" cy="90" rx="190" ry="5" fill="#000000" opacity="0.35" />
        <path d="M0 12 Q0 4 8 4 L316 4 Q334 4 344 16 L358 42 Q363 50 363 58 L363 72 Q363 78 357 78 L6 78 Q0 78 0 72 Z" fill="#1B2132" />
        <rect x="8" y="6" width="306" height="3" rx="1.5" fill="#FFFFFF" opacity="0.18" />
        <rect x="12" y="15" width="292" height="22" rx="3" fill="#070B14" />
        <rect x="12" y="15" width="292" height="5" rx="2" fill="#6B8FB5" opacity="0.28" />
        <path d="M314 13 Q330 13 338 22 L356 46 L324 46 Z" fill="#070B14" />
        <path d="M318 15 Q328 15 334 22 L340 30 L322 30 Z" fill="#6B8FB5" opacity="0.3" />
        <path d="M0 60 C110 60 210 42 363 48 L363 55 C210 50 110 68 0 68 Z" fill="#E8823A" />
        <path d="M0 54 C120 54 210 38 340 40 L338 43 C210 42 120 58 0 57 Z" fill="#F5EDD9" opacity="0.85" />
        <rect x="296" y="40" width="16" height="34" rx="2" fill="#141A28" stroke="#2C3448" strokeWidth="1" />
        <rect x="0" y="74" width="363" height="4" fill="#10141F" />
        <path d="M348 13 Q372 8 370 30" fill="none" stroke="#1B2132" strokeWidth="3" strokeLinecap="round" />
        <rect x="364" y="28" width="8" height="12" rx="2" fill="#1B2132" />
        <rect x="352" y="62" width="10" height="5" rx="2" fill="#F7E3B0" />
        <rect x="1" y="62" width="4" height="8" rx="1" fill="#C8392A" />
        {[62, 104, 296].map(cx => (
          <g key={cx}>
            <path d={`M${cx - 17} 78 A17 17 0 0 1 ${cx + 17} 78 Z`} fill="#05070D" />
            <circle cx={cx} cy="80" r="14" fill="#0B0F1A" />
            <circle cx={cx} cy="80" r="8.5" fill="#B9C0CD" />
            <circle cx={cx} cy="80" r="3" fill="#5A6070" />
          </g>
        ))}
        <rect x="-80" y="64" width="60" height="3" rx="1.5" fill="#F5EDD9" opacity="0.35" />
        <rect x="-124" y="50" width="78" height="3" rx="1.5" fill="#F5EDD9" opacity="0.2" />
      </g>

      <rect width="1440" height="340" fill="url(#crTourShade)" />
      <rect width="1440" height="340" fill="url(#crTourFade)" />
    </svg>
  );
}

/** Illustrated page header for the Tours page. */
export default function TourHighwayHero({ title, subtitle, summary, actions }: TourHighwayHeroProps) {
  return (
    <header className="tours-hero">
      <HighwayScene />
      <div className="tours-hero-content">
        <div className="tours-hero-text">
          <h1 className="tours-hero-title">{title}</h1>
          <p className="tours-hero-sub">{subtitle}</p>
          {summary && <p className="tours-hero-summary">{summary}</p>}
        </div>
        {actions && <div className="tours-hero-actions">{actions}</div>}
      </div>
    </header>
  );
}
