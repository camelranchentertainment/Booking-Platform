// components/help/CampfireScene.tsx
//
// Header illustration for the Help Center: a campfire under the stars with a
// guitar leaning on a log and a coffee pot on the coals — where you ask the
// old hands how it's done.
//
// Inline SVG in the desert-dusk family. Colours are illustration paint
// (literal hex); ids are prefixed `crHelp`. The left side is shaded so the
// page title stays readable.

const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [640, 40, 1.3], [700, 90, 1], [760, 30, 1.5], [830, 70, 1], [900, 24, 1.2], [960, 96, 1],
  [1030, 50, 1.4], [1090, 20, 1], [1150, 80, 1.2], [1220, 36, 1], [1290, 64, 1.3], [1360, 28, 1], [1400, 100, 1],
];

/** The decorative scene. aria-hidden: it carries no information. */
export default function CampfireScene() {
  return (
    <svg className="page-hero-art" viewBox="0 0 1440 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crHelpSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0E1530" />
          <stop offset="0.55" stopColor="#2A2350" />
          <stop offset="0.85" stopColor="#6A3450" />
          <stop offset="1" stopColor="#A9493E" />
        </linearGradient>
        <radialGradient id="crHelpGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFB45A" stopOpacity="0.7" />
          <stop offset="1" stopColor="#FFB45A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crHelpShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.94" />
          <stop offset="0.45" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crHelpFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crHelpSky)" />
      {STARS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#F5EDD9" opacity="0.85" />)}
      <path d="M1180 60 a26 26 0 1 0 22 40 a20 20 0 1 1 -22 -40 Z" fill="#F5EDD9" opacity="0.9" />

      <path d="M540 252 L600 214 L700 214 L740 240 L880 240 L930 206 L1040 206 L1090 252 Z" fill="#4A2A44" opacity="0.85" />
      <rect y="250" width="1440" height="90" fill="#2E1B2E" />

      {/* Fire glow, logs, flames */}
      <circle cx="1080" cy="248" r="120" fill="url(#crHelpGlow)" />
      <rect x="1040" y="250" width="80" height="9" rx="4" fill="#5C301A" transform="rotate(-12 1080 254)" />
      <rect x="1040" y="250" width="80" height="9" rx="4" fill="#4A2614" transform="rotate(12 1080 254)" />
      <path d="M1080 196 C1094 214 1104 228 1096 246 C1090 254 1070 254 1064 246 C1056 230 1068 214 1080 196 Z" fill="#E8602A" />
      <path d="M1080 214 C1088 226 1092 236 1086 246 C1082 250 1076 250 1072 246 C1068 236 1072 226 1080 214 Z" fill="#ECA834" />

      {/* Coffee pot on the coals */}
      <path d="M1124 238 L1128 222 L1146 222 L1150 238 Z" fill="#8A8C9C" />
      <rect x="1131" y="216" width="12" height="7" rx="2" fill="#6E7080" />

      {/* Sitting log and a guitar leaning on it */}
      <rect x="1180" y="244" width="110" height="16" rx="8" fill="#5C301A" />
      <g transform="rotate(-24 1236 228)">
        <ellipse cx="1236" cy="236" rx="16" ry="20" fill="#C9772E" />
        <ellipse cx="1236" cy="214" rx="12" ry="14" fill="#C9772E" />
        <circle cx="1236" cy="228" r="5" fill="#2A1A2E" />
        <rect x="1233" y="150" width="6" height="66" fill="#3A2235" />
        <rect x="1230" y="142" width="12" height="12" rx="2" fill="#3A2235" />
      </g>

      <rect width="1440" height="340" fill="url(#crHelpShade)" />
      <rect width="1440" height="340" fill="url(#crHelpFade)" />
    </svg>
  );
}
