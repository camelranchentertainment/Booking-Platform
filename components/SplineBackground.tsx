interface Props {
  scene?: string;
  opacity?: number;
}

export default function SplineBackground({
  scene = 'https://my.spline.design/metallictorus-L5ASmHS8eGBBEfo3MZbj2eqE/',
  opacity = 0.35,
}: Props) {
  return (
    <div
      className="spline-background"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity,
        overflow: 'hidden',
      }}
    >
      {/* Shift the ring toward warm amber/gold */}
      <div style={{
        position: 'absolute',
        inset: 0,
        filter: 'hue-rotate(30deg) saturate(1.8) brightness(0.95)',
      }}>
        <iframe
          src={scene}
          frameBorder="0"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="3D Background"
          loading="lazy"
          allow="autoplay"
        />
      </div>

      {/* Warm gold radial accent */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(ellipse 60% 50% at 50% 50%,
            rgba(196,154,60,0.14) 0%,
            rgba(150,100,20,0.06) 40%,
            transparent 70%)
        `,
        mixBlendMode: 'screen',
      }} />

      {/* Soft edge vignette */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(12,10,8,0.65) 100%)',
      }} />
    </div>
  );
}
