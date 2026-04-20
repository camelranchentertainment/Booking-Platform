interface Props {
  scene?: string;
  opacity?: number;
}

export default function SplineBackground({
  scene = 'https://my.spline.design/theeternalarc-d7tQhxwSrgAVdk1EbgFVb848-B7G/',
  opacity = 0.32,
}: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity,
        overflow: 'hidden',
      }}
    >
      {/* Shift the ring toward neon blue + boost saturation */}
      <div style={{
        position: 'absolute',
        inset: 0,
        filter: 'hue-rotate(185deg) saturate(2.2) brightness(1.15)',
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

      {/* Neon blue radial accent — concentrated where the ring sits */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(ellipse 60% 50% at 50% 50%,
            rgba(0,229,255,0.18) 0%,
            rgba(0,180,255,0.08) 40%,
            transparent 70%)
        `,
        mixBlendMode: 'screen',
      }} />

      {/* Soft edge vignette to keep it grounded */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(7,8,9,0.6) 100%)',
      }} />
    </div>
  );
}
