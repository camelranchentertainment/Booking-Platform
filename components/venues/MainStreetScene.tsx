// components/venues/MainStreetScene.tsx
//
// Header illustration for the Venues page: the Tours desert at dusk, now in
// town — a main street of rooms you could play: an old theater with a blade
// sign and marquee, a honky-tonk with a neon star, a brick bar with an awning,
// and the town water tower behind them.
//
// Inline SVG (no network request, crisp at any width). Colours are
// illustration paint, so they are literal hex values; gradient ids are
// prefixed `crVenue` so they cannot clash with another SVG on the page. The
// left side is shaded so the page title stays readable over it.

const MARQUEE_BULBS = Array.from({ length: 12 }, (_, i) => 838 + i * 10);
const BLADE_BULBS = [128, 142, 156, 170, 184, 198];

/** The decorative scene. aria-hidden: it carries no information. */
export default function MainStreetScene() {
  return (
    <svg
      className="page-hero-art"
      viewBox="0 0 1440 340"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="crVenueSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#18213F" />
          <stop offset="0.45" stopColor="#583754" />
          <stop offset="0.78" stopColor="#C2553C" />
          <stop offset="1" stopColor="#F09A4E" />
        </linearGradient>
        <radialGradient id="crVenueSpill" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F7C46A" stopOpacity="0.5" />
          <stop offset="1" stopColor="#F7C46A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crVenueShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.94" />
          <stop offset="0.45" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crVenueFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crVenueSky)" />
      <circle cx="1220" cy="214" r="70" fill="#F7C46A" opacity="0.16" />
      <circle cx="1220" cy="214" r="46" fill="#F7C46A" />

      {/* Far mesas */}
      <path d="M0 218 L160 218 L182 194 L330 194 L354 220 L560 220 L590 180 L690 180 L716 212 L1440 212 L1440 262 L0 262 Z" fill="#7A3B45" />

      {/* Water tower behind the street */}
      <g fill="#3A2238">
        <rect x="1288" y="160" width="4" height="70" />
        <rect x="1328" y="160" width="4" height="70" />
        <path d="M1290 196 L1330 176 M1290 176 L1330 196" stroke="#3A2238" strokeWidth="2" />
        <path d="M1278 126 Q1310 112 1342 126 L1342 160 Q1310 168 1278 160 Z" />
        <path d="M1274 128 L1310 108 L1346 128 Z" />
      </g>

      {/* Street and sidewalk */}
      <rect y="262" width="1440" height="78" fill="#2A1C2E" />
      <rect y="276" width="1440" height="64" fill="#151A2B" />
      <rect y="262" width="1440" height="14" fill="#33243A" />

      {/* Old theater: tall facade, blade sign, marquee */}
      <g>
        <rect x="820" y="120" width="140" height="142" fill="#2E2036" />
        <rect x="820" y="116" width="140" height="6" fill="#43314F" />
        {/* Blade sign (vertical) */}
        <rect x="868" y="78" width="44" height="78" rx="4" fill="#1B2132" stroke="#E8823A" strokeWidth="2" />
        {[92, 106, 120, 134].map(y => <rect key={y} x="880" y={y} width="20" height="6" rx="1.5" fill="#E8823A" opacity="0.9" />)}
        <g fill="#F7E3B0">
          {BLADE_BULBS.map(y => <circle key={y} cx="864" cy={y - 44} r="1.6" />)}
          {BLADE_BULBS.map(y => <circle key={y} cx="916" cy={y - 44} r="1.6" />)}
        </g>
        {/* Marquee */}
        <path d="M826 170 L954 170 L966 196 L814 196 Z" fill="#1B2132" />
        <rect x="830" y="176" width="120" height="5" rx="2" fill="#F5EDD9" opacity="0.85" />
        <rect x="846" y="185" width="88" height="5" rx="2" fill="#F5EDD9" opacity="0.6" />
        <g fill="#F7C46A">
          {MARQUEE_BULBS.map(x => <circle key={x} cx={x} cy="167" r="1.8" />)}
        </g>
        {/* Doors and spill */}
        <ellipse cx="890" cy="270" rx="70" ry="8" fill="url(#crVenueSpill)" />
        <rect x="852" y="212" width="76" height="50" fill="#F7C46A" opacity="0.85" />
        <rect x="889" y="212" width="2" height="50" fill="#2E2036" />
      </g>

      {/* Honky-tonk with a neon star */}
      <g>
        <rect x="966" y="166" width="150" height="96" fill="#3A2A3E" />
        <path d="M966 166 L1116 166 L1116 152 L1090 152 L1090 144 L992 144 L992 152 L966 152 Z" fill="#3A2A3E" />
        <path d="M1041 154 L1045 164 L1056 164 L1047 170 L1051 181 L1041 174 L1031 181 L1035 170 L1026 164 L1037 164 Z"
          fill="none" stroke="#E8823A" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M1041 154 L1045 164 L1056 164 L1047 170 L1051 181 L1041 174 L1031 181 L1035 170 L1026 164 L1037 164 Z"
          fill="none" stroke="#E8823A" strokeWidth="7" strokeLinejoin="round" opacity="0.25" />
        {[982, 1070].map(x => <rect key={x} x={x} y="200" width="32" height="26" rx="2" fill="#F7C46A" opacity="0.8" />)}
        <rect x="1026" y="214" width="30" height="48" fill="#F7C46A" opacity="0.9" />
      </g>

      {/* Brick bar with a striped awning */}
      <g>
        <rect x="1122" y="186" width="130" height="76" fill="#4A2630" />
        <rect x="1122" y="180" width="130" height="8" fill="#5A303A" />
        <path d="M1128 206 L1246 206 L1252 222 L1122 222 Z" fill="#E8823A" />
        {[1140, 1164, 1188, 1212, 1236].map(x => <path key={x} d={`M${x} 206 L${x + 10} 206 L${x + 12} 222 L${x + 2} 222 Z`} fill="#F5EDD9" opacity="0.85" />)}
        <rect x="1136" y="230" width="44" height="24" rx="2" fill="#F7C46A" opacity="0.75" />
        <rect x="1200" y="228" width="26" height="34" fill="#F7C46A" opacity="0.9" />
      </g>

      {/* Lamp posts and a saguaro at the edge of town */}
      <g fill="#1A1222">
        <rect x="800" y="210" width="4" height="56" />
        <rect x="1262" y="210" width="4" height="56" />
        <path d="M640 266 L640 206 Q640 198 648 198 Q656 198 656 206 L656 266 Z" />
        <path d="M640 238 L628 238 Q620 238 620 230 L620 216 Q620 210 626 210 Q632 210 632 216 L632 228 L640 228 Z" />
        <path d="M656 226 L668 226 L668 210 Q668 204 674 204 Q680 204 680 210 L680 228 Q680 236 672 236 L656 236 Z" />
      </g>
      <circle cx="802" cy="208" r="5" fill="#F7E3B0" />
      <circle cx="1264" cy="208" r="5" fill="#F7E3B0" />

      {/* Center line */}
      <g fill="#F5C46A">
        {Array.from({ length: 16 }, (_, i) => i * 90).map(x => <rect key={x} x={x} y="304" width="44" height="3" />)}
      </g>

      <rect width="1440" height="340" fill="url(#crVenueShade)" />
      <rect width="1440" height="340" fill="url(#crVenueFade)" />
    </svg>
  );
}
