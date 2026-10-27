// components/members/BandVanScene.tsx
//
// Header illustration for the Members page: the band's rig — a sprinter van
// towing an enclosed trailer — parked outside a desert motel at dusk, the
// "VACANCY" sign lit and a few rooms glowing. It's the crew that travels
// together.
//
// Inline SVG, same desert-dusk family as the Tours highway. Colours are
// illustration paint, so they are literal hex values; ids are prefixed
// `crMembers` so they never clash with another SVG on the page. The left side
// is shaded so the page title stays readable over it.

/** x positions of the motel's room doors. */
const DOORS = [930, 990, 1050, 1110, 1170, 1230, 1290];
/** Rooms with a light on (index into DOORS). */
const LIT = new Set([1, 2, 4, 6]);

/** The decorative scene. aria-hidden: it carries no information. */
export default function BandVanScene() {
  return (
    <svg
      className="page-hero-art"
      viewBox="0 0 1440 340"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="crMembersSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1A2347" />
          <stop offset="0.45" stopColor="#4A2F5C" />
          <stop offset="0.78" stopColor="#B4514A" />
          <stop offset="1" stopColor="#ED8A45" />
        </linearGradient>
        <radialGradient id="crMembersSun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFD089" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFD089" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="crMembersNeon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FF6A3D" stopOpacity="0.6" />
          <stop offset="1" stopColor="#FF6A3D" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crMembersShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.94" />
          <stop offset="0.45" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crMembersFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crMembersSky)" />

      {/* Setting sun and far mesas */}
      <circle cx="760" cy="236" r="120" fill="url(#crMembersSun)" />
      <circle cx="760" cy="236" r="38" fill="#FFC27A" opacity="0.85" />
      <path d="M520 248 L580 196 L660 196 L700 230 L820 230 L860 186 L960 186 L1000 248 Z" fill="#6E3446" opacity="0.8" />
      <path d="M1180 248 L1230 210 L1330 210 L1370 248 Z" fill="#6E3446" opacity="0.7" />

      {/* Ground */}
      <rect y="246" width="1440" height="94" fill="#3A2235" />
      <rect y="246" width="1440" height="6" fill="#5A2F3A" />

      {/* Motel: long low building with doors and a roof line */}
      <rect x="900" y="196" width="440" height="58" fill="#2A1A2E" />
      <rect x="892" y="188" width="456" height="10" fill="#4A2A3A" />
      {DOORS.map((x, i) => (
        <g key={x}>
          <rect x={x} y="212" width="22" height="40" fill={LIT.has(i) ? '#F7C46A' : '#1C1424'} opacity={LIT.has(i) ? 0.85 : 1} />
          <rect x={x + 28} y="214" width="18" height="14" fill={LIT.has(i) ? '#F2A85B' : '#1C1424'} opacity={LIT.has(i) ? 0.7 : 1} />
        </g>
      ))}

      {/* Neon sign on the motel roof (kept inside the frame at narrow widths) */}
      <rect x="1262" y="128" width="6" height="62" fill="#2A1A2E" />
      <circle cx="1265" cy="128" r="48" fill="url(#crMembersNeon)" />
      <rect x="1228" y="112" width="74" height="30" rx="4" fill="#1C1424" stroke="#FF6A3D" strokeWidth="2.5" />
      <text x="1265" y="133" textAnchor="middle" fontFamily="Bebas Neue, Impact, sans-serif" fontSize="17" letterSpacing="2" fill="#FF8A5C">
        VACANCY
      </text>

      {/* Sprinter van (high roof) */}
      <g transform="translate(560 196)">
        <rect x="0" y="6" width="170" height="54" rx="8" fill="#E9DCBC" />
        <path d="M170 18 L200 30 L206 60 L170 60 Z" fill="#E9DCBC" />
        <path d="M174 22 L198 32 L201 44 L174 44 Z" fill="#2B3A5C" />
        <rect x="16" y="18" width="38" height="18" rx="3" fill="#2B3A5C" />
        <rect x="62" y="18" width="38" height="18" rx="3" fill="#2B3A5C" />
        <rect x="0" y="40" width="206" height="6" fill="#E8602A" />
        <rect x="0" y="47" width="206" height="3" fill="#ECA834" />
        <circle cx="40" cy="62" r="13" fill="#1C1424" />
        <circle cx="40" cy="62" r="5" fill="#8A8C9C" />
        <circle cx="166" cy="62" r="13" fill="#1C1424" />
        <circle cx="166" cy="62" r="5" fill="#8A8C9C" />
        <circle cx="204" cy="50" r="3" fill="#FFE2A0" />
      </g>

      {/* Hitch + enclosed trailer behind the van */}
      <rect x="532" y="246" width="30" height="4" fill="#1C1424" />
      <g transform="translate(400 206)">
        <path d="M0 8 Q0 0 8 0 L124 0 Q132 0 132 8 L132 44 L0 44 Z" fill="#C9BFA6" />
        <rect x="0" y="30" width="132" height="5" fill="#E8602A" />
        <rect x="10" y="10" width="112" height="2" fill="#B0A68E" />
        <circle cx="66" cy="52" r="11" fill="#1C1424" />
        <circle cx="66" cy="52" r="4" fill="#8A8C9C" />
      </g>

      {/* A few band silhouettes unloading */}
      <g fill="#1C1424">
        <circle cx="786" cy="214" r="7" />
        <rect x="780" y="221" width="12" height="26" rx="4" />
        <circle cx="814" cy="216" r="6.5" />
        <rect x="808" y="222" width="12" height="25" rx="4" />
        {/* guitar case */}
        <rect x="822" y="226" width="7" height="22" rx="3" transform="rotate(-12 825 237)" />
        <circle cx="842" cy="213" r="7" />
        <rect x="836" y="220" width="12" height="27" rx="4" />
      </g>

      <rect width="1440" height="340" fill="url(#crMembersShade)" />
      <rect width="1440" height="340" fill="url(#crMembersFade)" />
    </svg>
  );
}
