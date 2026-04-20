interface Props {
  scene?: string;
  opacity?: number;
}

export default function SplineBackground({
  scene = 'https://my.spline.design/theeternalarc-d7tQhxwSrgAVdk1EbgFVb848-B7G/',
  opacity = 0.28,
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
      <iframe
        src={scene}
        frameBorder="0"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
        title="3D Background"
        loading="lazy"
        allow="autoplay"
      />
    </div>
  );
}
