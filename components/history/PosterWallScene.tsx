// components/history/PosterWallScene.tsx
//
// Header illustration for Show History: the side of an old club at dusk,
// its brick wall layered with gig posters from shows gone by, lit by a
// single lamp. Same desert-dusk family as the other page heroes.
//
// Inline SVG; colours are illustration paint (literal hex). ids are prefixed
// `crHist` so they never clash with another SVG on the page. The left side is
// shaded so the page title stays readable. aria-hidden: decorative.

/** [x, y, w, h, tilt°, paper, ink] for each poster. */
const POSTERS: Array<[number, number, number, number, number, string, string]> = [
  [790, 70, 92, 128, -4, '#f5ede2', '#e8823a'],
  [890, 58, 84, 116, 3, '#e8823a', '#16243f'],
  [984, 74, 98, 132, -2, '#4a90e2', '#f5ede2'],
  [1092, 60, 86, 120, 4, '#f2c25a', '#7a2f3a'],
  [1186, 76, 96, 128, -3, '#f5ede2', '#3d2a58'],
  [1290, 64, 88, 122, 2, '#e05a8a', '#f5ede2'],
  [840, 150, 80, 104, 5, '#f2c25a', '#16243f'],
  [1040, 160, 92, 100, -5, '#f5ede2', '#4a90e2'],
  [1240, 158, 84, 100, 3, '#e8823a', '#f5ede2'],
];

/** The decorative scene. */
export default function PosterWallScene() {
  return (
    <svg className="page-hero-art" viewBox="0 0 1440 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crHistSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141c3c" />
          <stop offset="0.55" stopColor="#3d2a58" />
          <stop offset="1" stopColor="#a8484a" />
        </linearGradient>
        <pattern id="crHistBrick" width="48" height="24" patternUnits="userSpaceOnUse">
          <rect width="48" height="24" fill="#4a2232" />
          <path d="M0 0 H48 M0 12 H48 M24 0 V12 M0 12 V24 M48 12 V24" stroke="#331622" strokeWidth="2" />
        </pattern>
        <radialGradient id="crHistLamp" cx="0.5" cy="0" r="0.8">
          <stop offset="0" stopColor="#ffd59a" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffd59a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crHistShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.95" />
          <stop offset="0.42" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crHistFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.62" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crHistSky)" />
      {[[620, 40], [700, 90], [660, 150]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#ffe9c7" opacity="0.7" />)}

      {/* the wall */}
      <rect x="740" y="30" width="700" height="250" fill="url(#crHistBrick)" />
      <rect x="740" y="22" width="700" height="10" fill="#24162c" />

      {/* posters, layered */}
      {POSTERS.map(([x, y, w, h, tilt, paper, ink], i) => (
        <g key={i} transform={`rotate(${tilt} ${x + w / 2} ${y + h / 2})`}>
          <rect x={x} y={y} width={w} height={h} fill={paper} opacity="0.92" />
          <circle cx={x + w / 2} cy={y + h * 0.36} r={w * 0.22} fill={ink} opacity="0.85" />
          <rect x={x + 10} y={y + h * 0.66} width={w - 20} height="9" fill={ink} opacity="0.85" />
          <rect x={x + 18} y={y + h * 0.66 + 15} width={w - 36} height="6" fill={ink} opacity="0.6" />
          {/* a torn corner */}
          <path d={`M${x + w - 16} ${y + h} L${x + w} ${y + h - 14} L${x + w} ${y + h} Z`} fill="#4a2232" />
        </g>
      ))}

      {/* lamp */}
      <rect x="1060" y="22" width="40" height="8" rx="3" fill="#1a1222" />
      <path d="M1060 30 L1100 30 L1112 46 L1048 46 Z" fill="#1a1222" />
      <path d="M1048 46 L1112 46 L1260 280 L900 280 Z" fill="url(#crHistLamp)" />

      {/* sidewalk */}
      <rect x="0" y="278" width="1440" height="62" fill="#1a1222" />

      <rect width="1440" height="340" fill="url(#crHistShade)" />
      <rect width="1440" height="340" fill="url(#crHistFade)" />
    </svg>
  );
}
