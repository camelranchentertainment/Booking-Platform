// components/dashboard/StageScene.tsx
//
// Header illustration for the band Dashboard: the Tours desert at dusk with
// an open-air stage — truss, PA stacks, light beams sweeping the sky — and a
// crowd in silhouette. Home base for the band.
//
// Inline SVG (no network request, crisp at any width). Colours are
// illustration paint, so they are literal hex values; gradient ids are
// prefixed `crDash` so they cannot clash with another SVG on the page.

/** Crowd heads along the bottom: [x, radius]. Deterministic, no randomness at render. */
const CROWD: ReadonlyArray<readonly [number, number]> = Array.from({ length: 34 }, (_, i) => {
  const x = 700 + i * 22 + ((i * 37) % 9);
  const r = 9 + ((i * 13) % 4);
  return [x, r] as const;
});

/** The decorative scene. aria-hidden: it carries no information. */
export default function StageScene() {
  return (
    <svg className="page-hero-art" viewBox="0 0 1440 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crDashSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141C3B" />
          <stop offset="0.45" stopColor="#4F2F55" />
          <stop offset="0.78" stopColor="#B4503F" />
          <stop offset="1" stopColor="#F09A4E" />
        </linearGradient>
        <linearGradient id="crDashBeam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#F7C46A" stopOpacity="0.35" />
          <stop offset="1" stopColor="#F7C46A" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="crDashGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#E8823A" stopOpacity="0.55" />
          <stop offset="1" stopColor="#E8823A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crDashShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.94" />
          <stop offset="0.45" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crDashFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.62" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crDashSky)" />

      {/* Light beams from the truss */}
      <path d="M930 96 L840 0 L900 0 Z" fill="url(#crDashBeam)" />
      <path d="M1020 96 L1010 0 L1070 0 Z" fill="url(#crDashBeam)" />
      <path d="M1110 96 L1180 0 L1250 0 Z" fill="url(#crDashBeam)" />

      {/* Mesas */}
      <path d="M0 214 L140 214 L162 188 L320 188 L344 214 L560 214 L590 172 L690 172 L716 208 L1440 208 L1440 262 L0 262 Z" fill="#6E3546" />
      <rect y="250" width="1440" height="90" fill="#24192C" />

      {/* Stage glow, deck, truss, PA */}
      <ellipse cx="1020" cy="232" rx="230" ry="60" fill="url(#crDashGlow)" />
      <g fill="#1A1222">
        <rect x="870" y="96" width="8" height="140" />
        <rect x="1162" y="96" width="8" height="140" />
        <rect x="870" y="90" width="300" height="10" />
        <path d="M878 100 L894 90 L910 100 L926 90 L942 100 L958 90 L974 100 L990 90 L1006 100 L1022 90 L1038 100 L1054 90 L1070 100 L1086 90 L1102 100 L1118 90 L1134 100 L1150 90 L1162 100" fill="none" stroke="#2C2036" strokeWidth="2" />
        <rect x="850" y="226" width="340" height="16" />
        <rect x="830" y="150" width="34" height="76" rx="3" />
        <rect x="1176" y="150" width="34" height="76" rx="3" />
      </g>
      {/* Lamps on the truss */}
      <g fill="#F7C46A">
        {[930, 1020, 1110].map(x => <rect key={x} x={x - 6} y="100" width="12" height="7" rx="2" />)}
      </g>
      {/* Band on stage */}
      <g fill="#0F0B16">
        <circle cx="980" cy="186" r="8" /><rect x="972" y="194" width="16" height="32" rx="5" />
        <circle cx="1030" cy="182" r="8" /><rect x="1022" y="190" width="16" height="36" rx="5" />
        <rect x="1040" y="204" width="34" height="5" rx="2" transform="rotate(-18 1040 204)" />
        <circle cx="1084" cy="190" r="7" /><rect x="1076" y="197" width="16" height="29" rx="5" />
        <rect x="1016" y="214" width="28" height="12" rx="3" />
      </g>
      {/* Speaker cones */}
      <g fill="#2C3448">
        {[170, 200].map(y => (
          <g key={y}>
            <circle cx="847" cy={y} r="10" />
            <circle cx="1193" cy={y} r="10" />
          </g>
        ))}
      </g>

      {/* Crowd */}
      <g fill="#0F0B16">
        {CROWD.map(([x, r]) => (
          <g key={x}>
            <circle cx={x} cy={300 - r} r={r} />
            <rect x={x - r - 4} y={300} width={(r + 4) * 2} height="40" rx="8" />
          </g>
        ))}
        <rect x="760" y="262" width="5" height="34" transform="rotate(-20 760 262)" />
        <rect x="1288" y="258" width="5" height="38" transform="rotate(16 1288 258)" />
      </g>

      {/* Saguaro off to the side */}
      <g fill="#1A1222">
        <path d="M600 266 L600 210 Q600 202 608 202 Q616 202 616 210 L616 266 Z" />
        <path d="M600 238 L588 238 Q580 238 580 230 L580 216 Q580 210 586 210 Q592 210 592 216 L592 228 L600 228 Z" />
        <path d="M616 226 L628 226 L628 210 Q628 204 634 204 Q640 204 640 210 L640 228 Q640 236 632 236 L616 236 Z" />
      </g>

      <rect width="1440" height="340" fill="url(#crDashShade)" />
      <rect width="1440" height="340" fill="url(#crDashFade)" />
    </svg>
  );
}
