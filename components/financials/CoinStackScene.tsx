// components/financials/CoinStackScene.tsx
//
// Header illustration for Financials: desert dusk where the skyline is a row
// of rising coin stacks — a bar chart in gold — against a low sun. Same
// desert-dusk family as the Tours highway and the Analytics soundboard.
//
// Inline SVG; colours are illustration paint (literal hex). ids are prefixed
// `crMoney` so they never clash with another SVG on the page. The left side
// is shaded so the page title stays readable. aria-hidden: decorative.

/** Coins per stack, left to right. */
const STACKS = [4, 6, 5, 8, 7, 10, 9, 12, 11, 14, 12, 15];
const COIN_H = 7;

/** The decorative scene. */
export default function CoinStackScene() {
  const x0 = 720;
  const step = 52;
  const base = 238;
  return (
    <svg className="page-hero-art" viewBox="0 0 1440 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crMoneySky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141c3c" />
          <stop offset="0.48" stopColor="#3d2a58" />
          <stop offset="0.8" stopColor="#a8484a" />
          <stop offset="1" stopColor="#e8823a" />
        </linearGradient>
        <radialGradient id="crMoneySun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd27a" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#ff9d4d" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff9d4d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crMoneyCoin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b8772a" />
          <stop offset="0.45" stopColor="#f2c25a" />
          <stop offset="1" stopColor="#9a5e22" />
        </linearGradient>
        <linearGradient id="crMoneyShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.95" />
          <stop offset="0.42" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crMoneyFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.62" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crMoneySky)" />
      {[[650, 36], [760, 70], [1190, 28], [1330, 62], [990, 46], [870, 18]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#ffe9c7" opacity="0.7" />
      ))}

      {/* low sun behind the stacks */}
      <circle cx="1060" cy="236" r="120" fill="url(#crMoneySun)" />
      <circle cx="1060" cy="236" r="46" fill="#ffc46b" opacity="0.85" />

      {/* distant mesas */}
      <path d="M560 252 L620 220 L700 220 L740 246 L880 246 L920 210 L1020 210 L1060 252 Z" fill="#5a2e44" opacity="0.7" />
      <path d="M1210 252 L1260 226 L1370 226 L1410 252 Z" fill="#5a2e44" opacity="0.55" />

      {/* ground */}
      <rect x="0" y="238" width="1440" height="102" fill="#24162c" />
      <rect x="0" y="236" width="1440" height="4" fill="#3d2436" />

      {/* rising coin stacks — the skyline */}
      {STACKS.map((n, i) => {
        const cx = x0 + i * step;
        return (
          <g key={i}>
            {Array.from({ length: n }, (_, c) => {
              const y = base - (c + 1) * COIN_H;
              return (
                <g key={c}>
                  <rect x={cx - 17} y={y} width="34" height={COIN_H} fill="url(#crMoneyCoin)" />
                  <ellipse cx={cx} cy={y} rx="17" ry="3.4" fill={c === n - 1 ? '#f7d27a' : '#d89a3c'} />
                </g>
              );
            })}
          </g>
        );
      })}

      <rect width="1440" height="340" fill="url(#crMoneyShade)" />
      <rect width="1440" height="340" fill="url(#crMoneyFade)" />
    </svg>
  );
}
