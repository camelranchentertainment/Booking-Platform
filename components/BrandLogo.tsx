import { useState } from 'react';

interface Props {
  variant?: 'square' | 'banner';
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

const GOLD = '#E07820';
const CREAM = '#EFE0BD';

function SquareFallback({ size }: { size: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: `${size * 0.32}px`,
        letterSpacing: '0.12em',
        color: CREAM,
        lineHeight: 1,
        textAlign: 'center',
      }}>
        CAMEL RANCH
      </div>
      <div style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 700,
        fontSize: `${size * 0.14}px`,
        letterSpacing: '0.5em',
        color: GOLD,
        textTransform: 'uppercase',
        borderTop: `1px solid rgba(224,120,32,0.3)`,
        paddingTop: '0.2rem',
        width: '100%',
        textAlign: 'center',
      }}>
        BOOKING
      </div>
    </div>
  );
}

function BannerFallback({ height }: { height: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: `${height * 0.3}px` }}>
      <div style={{
        width: height,
        height: height,
        borderRadius: '50%',
        border: `2px solid rgba(224,120,32,0.4)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(224,120,32,0.08)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: `${height * 0.5}px` }}>🐪</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: `${height * 0.45}px`,
          letterSpacing: '0.12em',
          color: CREAM,
          lineHeight: 1,
        }}>
          CAMEL RANCH
        </div>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 700,
          fontSize: `${height * 0.22}px`,
          letterSpacing: '0.45em',
          color: GOLD,
          textTransform: 'uppercase',
          marginTop: '0.2rem',
        }}>
          — BOOKING —
        </div>
      </div>
    </div>
  );
}

export default function BrandLogo({ variant = 'square', height = 72, className, style }: Props) {
  const [imgError, setImgError] = useState(false);

  const src = variant === 'banner' ? '/logo-banner.svg' : '/logo-square.svg';

  if (imgError) {
    return variant === 'banner'
      ? <BannerFallback height={height} />
      : <SquareFallback size={height} />;
  }

  return (
    <img
      src={src}
      alt="Camel Ranch Booking"
      height={height}
      width={variant === 'banner' ? height * 3.5 : height}
      className={className}
      style={{
        objectFit: 'contain',
        display: 'block',
        ...style,
      }}
      onError={() => setImgError(true)}
    />
  );
}
