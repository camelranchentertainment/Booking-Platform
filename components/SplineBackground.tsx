import dynamic from 'next/dynamic';

const Spline = dynamic(() => import('@splinetool/react-spline'), { ssr: false });

interface Props {
  scene?: string;
  opacity?: number;
}

export default function SplineBackground({
  scene = 'https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode',
  opacity = 0.25,
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
      <Spline scene={scene} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
