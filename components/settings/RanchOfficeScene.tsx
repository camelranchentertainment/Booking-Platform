// components/settings/RanchOfficeScene.tsx
//
// Header illustration for Settings: the ranch office at dusk — a small
// clapboard building with a lit window, a windmill turning beside it, a
// mailbox at the road and a string of fence posts running off into the
// mesas. Where the paperwork gets done.
//
// Inline SVG in the same desert-dusk family as the Tours highway. Colours are
// illustration paint (literal hex); ids are prefixed `crSettings` so they never
// clash. The left side is shaded so the page title stays readable.

const POSTS = Array.from({ length: 14 }, (_, i) => 520 + i * 44);

/** The decorative scene. aria-hidden: it carries no information. */
export default function RanchOfficeScene() {
  return (
    <svg className="page-hero-art" viewBox="0 0 1440 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crSettingsSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#18234A" />
          <stop offset="0.5" stopColor="#523160" />
          <stop offset="0.8" stopColor="#C05A4A" />
          <stop offset="1" stopColor="#F09A4E" />
        </linearGradient>
        <radialGradient id="crSettingsSun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFD38E" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFD38E" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="crSettingsLamp" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F7C46A" stopOpacity="0.55" />
          <stop offset="1" stopColor="#F7C46A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crSettingsShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.94" />
          <stop offset="0.45" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crSettingsFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crSettingsSky)" />
      <circle cx="1010" cy="240" r="130" fill="url(#crSettingsSun)" />
      <circle cx="1010" cy="240" r="40" fill="#FFC27A" opacity="0.85" />
      <path d="M560 250 L620 200 L720 200 L760 236 L900 236 L950 192 L1060 192 L1110 250 Z" fill="#6E3446" opacity="0.8" />

      <rect y="248" width="1440" height="92" fill="#3A2235" />

      {/* Fence line */}
      {POSTS.map(x => <rect key={x} x={x} y="236" width="5" height="18" fill="#2A1A2E" />)}
      <rect x="520" y="240" width="580" height="2" fill="#2A1A2E" />
      <rect x="520" y="247" width="580" height="2" fill="#2A1A2E" />

      {/* Ranch office */}
      <circle cx="1186" cy="214" r="70" fill="url(#crSettingsLamp)" />
      <path d="M1120 186 L1190 150 L1260 186 Z" fill="#4A2A3A" />
      <rect x="1128" y="186" width="124" height="66" fill="#2A1A2E" />
      {[196, 208, 220, 232, 244].map(y => <rect key={y} x="1128" y={y} width="124" height="1.5" fill="#3A2440" />)}
      <rect x="1150" y="202" width="28" height="22" fill="#F7C46A" opacity="0.9" />
      <rect x="1163" y="202" width="2" height="22" fill="#2A1A2E" />
      <rect x="1200" y="208" width="22" height="44" fill="#1C1424" />
      <rect x="1140" y="176" width="44" height="12" rx="2" fill="#1C1424" />
      <text x="1162" y="185" textAnchor="middle" fontFamily="Bebas Neue, Impact, sans-serif" fontSize="9" letterSpacing="1.5" fill="#ECA834">OFFICE</text>

      {/* Windmill */}
      <g stroke="#1C1424" strokeWidth="3">
        <line x1="1300" y1="252" x2="1318" y2="150" />
        <line x1="1336" y1="252" x2="1318" y2="150" />
        <line x1="1304" y1="222" x2="1332" y2="222" />
        <line x1="1308" y1="196" x2="1328" y2="196" />
      </g>
      <g transform="translate(1318 146)" fill="#1C1424">
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
          <rect key={a} x="-2" y="-30" width="4" height="30" transform={`rotate(${a})`} />
        ))}
        <circle r="5" />
        <path d="M6 -3 L34 -6 L34 6 L6 3 Z" />
      </g>

      {/* Mailbox at the road */}
      <rect x="1084" y="230" width="4" height="24" fill="#1C1424" />
      <path d="M1074 222 Q1074 214 1082 214 L1092 214 Q1100 214 1100 222 L1100 232 L1074 232 Z" fill="#1C1424" />
      <rect x="1098" y="214" width="2" height="12" fill="#E8602A" />

      <rect width="1440" height="340" fill="url(#crSettingsShade)" />
      <rect width="1440" height="340" fill="url(#crSettingsFade)" />
    </svg>
  );
}
