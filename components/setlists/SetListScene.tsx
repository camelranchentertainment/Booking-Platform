// components/setlists/SetListScene.tsx
//
// Header illustration for the Set Lists page: the same desert dusk as the
// Tours and Today headers, seen from the stage — a mic stand, a monitor wedge
// with the night's set list taped to it, and amp glow against the sky.
//
// Inline SVG, aria-hidden (decoration only). Colours are illustration paint,
// so they are literal hex values; gradient ids are prefixed `crSet` so they
// can't clash with another SVG on the page. The left side is shaded so the
// page title stays readable over it.

/** The decorative scene. */
export default function SetListScene() {
  return (
    <svg
      className="page-hero-art"
      viewBox="0 0 1440 340"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="crSetSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141C3A" />
          <stop offset="0.5" stopColor="#3A2856" />
          <stop offset="0.8" stopColor="#9A4650" />
          <stop offset="1" stopColor="#E0763E" />
        </linearGradient>
        <radialGradient id="crSetSpot" cx="0.5" cy="0" r="0.8">
          <stop offset="0" stopColor="#F7C46A" stopOpacity="0.45" />
          <stop offset="1" stopColor="#F7C46A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crSetShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crSetFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crSetSky)" />

      {/* Distant mesas */}
      <path d="M0 250 L180 236 L260 212 L340 214 L420 238 L620 242 L700 222 L780 220 L860 244 L1440 236 L1440 340 L0 340 Z" fill="#2A1E3E" />

      {/* Spotlight cone onto the stage */}
      <path d="M1060 0 L940 300 L1240 300 Z" fill="url(#crSetSpot)" />

      {/* Stage deck */}
      <rect x="760" y="282" width="680" height="58" fill="#1B1426" />
      <rect x="760" y="280" width="680" height="4" fill="#E8823A" opacity="0.6" />

      {/* Amp stack */}
      <rect x="1250" y="180" width="120" height="100" rx="4" fill="#120E1C" stroke="#3B2F52" strokeWidth="2" />
      <rect x="1262" y="192" width="96" height="10" rx="2" fill="#2B2340" />
      <circle cx="1287" cy="245" r="20" fill="#1E1830" stroke="#3B2F52" strokeWidth="2" />
      <circle cx="1333" cy="245" r="20" fill="#1E1830" stroke="#3B2F52" strokeWidth="2" />
      <circle cx="1356" cy="197" r="3" fill="#F7C46A" />

      {/* Mic stand */}
      <line x1="1060" y1="282" x2="1060" y2="150" stroke="#0E0A16" strokeWidth="5" />
      <line x1="1060" y1="150" x2="1012" y2="128" stroke="#0E0A16" strokeWidth="4" />
      <rect x="996" y="118" width="22" height="12" rx="6" fill="#0E0A16" transform="rotate(-24 1007 124)" />
      <path d="M1036 282 L1060 270 L1084 282 Z" fill="#0E0A16" />

      {/* Monitor wedge with the set list taped on */}
      <path d="M900 282 L924 240 L1010 240 L1018 282 Z" fill="#100C18" stroke="#3B2F52" strokeWidth="2" />
      <g transform="rotate(-6 960 236)">
        <rect x="934" y="196" width="50" height="62" fill="#F5EDD9" />
        <rect x="944" y="190" width="30" height="8" fill="#E8823A" opacity="0.85" />
        <rect x="940" y="208" width="36" height="3" fill="#2B2340" />
        <rect x="940" y="216" width="30" height="3" fill="#2B2340" />
        <rect x="940" y="224" width="38" height="3" fill="#2B2340" />
        <rect x="940" y="232" width="26" height="3" fill="#2B2340" />
        <rect x="940" y="240" width="34" height="3" fill="#2B2340" />
        <rect x="940" y="248" width="22" height="3" fill="#2B2340" />
      </g>

      {/* Cable run */}
      <path d="M1060 282 C1110 296 1180 300 1250 280" stroke="#0E0A16" strokeWidth="3" fill="none" />

      <rect width="1440" height="340" fill="url(#crSetShade)" />
      <rect width="1440" height="340" fill="url(#crSetFade)" />
    </svg>
  );
}
