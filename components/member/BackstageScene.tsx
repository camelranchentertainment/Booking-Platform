// components/member/BackstageScene.tsx
//
// Header illustration for the member pages (My Shows, Calendar, Pay): the
// back of a venue at dusk — a lit stage door, stacked road cases with
// stencilled lids, an amp and a guitar case leaning on the wall. Same
// desert-dusk family as the other page heroes.
//
// Inline SVG; colours are illustration paint (literal hex). ids are prefixed
// `crBack` so they never clash with another SVG on the page. The left side is
// shaded so the page title stays readable. aria-hidden: decorative.

/** The decorative scene. */
export default function BackstageScene() {
  return (
    <svg className="page-hero-art" viewBox="0 0 1440 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crBackSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141c3c" />
          <stop offset="0.55" stopColor="#3d2a58" />
          <stop offset="1" stopColor="#a8484a" />
        </linearGradient>
        <radialGradient id="crBackDoor" cx="0.5" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ffd59a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffd59a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crBackShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.95" />
          <stop offset="0.42" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crBackFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.62" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crBackSky)" />
      {[[640, 36], [720, 84], [1300, 30], [1380, 60]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#ffe9c7" opacity="0.7" />)}

      {/* building */}
      <rect x="760" y="40" width="680" height="240" fill="#2a1a2e" />
      <rect x="760" y="34" width="680" height="10" fill="#1a1222" />
      {/* stage door, open, light spilling out */}
      <ellipse cx="1000" cy="250" rx="220" ry="70" fill="url(#crBackDoor)" />
      <rect x="950" y="120" width="100" height="160" fill="#ffc46b" opacity="0.9" />
      <path d="M950 120 L984 110 L984 290 L950 280 Z" fill="#3a2430" />
      <rect x="936" y="104" width="128" height="10" fill="#1a1222" />
      <circle cx="1000" cy="94" r="7" fill="#ffe08a" />
      {/* STAGE DOOR sign as blocks */}
      <rect x="958" y="66" width="84" height="18" rx="2" fill="#e8823a" />

      {/* road cases (left of door) */}
      {[[790, 200, 130, 80], [800, 150, 110, 52], [812, 110, 86, 42]].map(([x, y, w, h], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={h} rx="4" fill="#120c18" stroke="#4a3150" strokeWidth="2" />
          <rect x={x + 6} y={y + 6} width={w - 12} height="5" fill="#4a3150" />
          <rect x={x + w / 2 - 22} y={y + h / 2 - 5} width="44" height="10" rx="2" fill="#f5ede2" opacity="0.75" />
        </g>
      ))}

      {/* amp + guitar case (right of door) */}
      <rect x="1110" y="190" width="96" height="90" rx="6" fill="#120c18" stroke="#4a3150" strokeWidth="2" />
      <rect x="1120" y="200" width="76" height="56" rx="3" fill="#24162c" />
      {[1132, 1148, 1164, 1180].map(x => <circle key={x} cx={x} cy="268" r="3" fill="#e8823a" />)}
      <path d="M1236 280 C1220 230 1226 196 1246 168 C1256 154 1272 156 1276 172 C1282 200 1270 244 1262 280 Z" fill="#120c18" stroke="#4a3150" strokeWidth="2" />

      {/* string lights along the roofline */}
      <path d="M760 50 Q 900 74 1040 50 T 1320 50 L1440 54" fill="none" stroke="#1a1222" strokeWidth="2" />
      {[800, 850, 900, 950, 1090, 1140, 1190, 1240, 1290, 1360, 1410].map((x, i) => (
        <circle key={x} cx={x} cy={56 + Math.sin(i) * 6} r="4" fill={i % 2 ? '#ffe08a' : '#ffc46b'} />
      ))}

      <rect x="0" y="278" width="1440" height="62" fill="#1a1222" />
      <rect width="1440" height="340" fill="url(#crBackShade)" />
      <rect width="1440" height="340" fill="url(#crBackFade)" />
    </svg>
  );
}
