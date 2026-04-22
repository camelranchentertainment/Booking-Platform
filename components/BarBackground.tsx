export default function BarBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>

      {/* ── Base: deep mahogany wood, not pitch-black ── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(160deg, #100603 0%, #1E0B04 35%, #170805 65%, #0E0502 100%)',
      }} />

      {/* ── Animated bar light blobs ── */}
      <div className="bar-blob bar-blob-amber" />
      <div className="bar-blob bar-blob-purple" />
      <div className="bar-blob bar-blob-pink" />
      <div className="bar-blob bar-blob-orange" />
      <div className="bar-blob bar-blob-gold" />
      <div className="bar-blob bar-blob-indigo" />

      {/* ── Crowd silhouettes ── people shapes at the bottom */}
      <div className="crowd-wrap">
        <div className="sil sil-1" />
        <div className="sil sil-2" />
        <div className="sil sil-3" />
        <div className="sil sil-4" />
        <div className="sil sil-5" />
        <div className="sil sil-6" />
        <div className="sil sil-7" />
      </div>

      {/* ── Dust / smoke particles drifting upward ── */}
      <div className="dust d1" /><div className="dust d2" /><div className="dust d3" />
      <div className="dust d4" /><div className="dust d5" /><div className="dust d6" />
      <div className="dust d7" /><div className="dust d8" /><div className="dust d9" />
      <div className="dust d10" /><div className="dust d11" /><div className="dust d12" />
      <div className="dust d13" /><div className="dust d14" /><div className="dust d15" />

      {/* ── Decorative neon signs ── barely visible, set the mood */}
      <div className="neon-deco neon-live">LIVE MUSIC</div>
      <div className="neon-deco neon-star">★</div>
      <div className="neon-deco neon-bar">BAR</div>

      {/* ── Wood grain texture overlay ── */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `repeating-linear-gradient(
          90deg,
          transparent,
          transparent 180px,
          rgba(80, 40, 10, 0.03) 180px,
          rgba(80, 40, 10, 0.03) 181px
        ), repeating-linear-gradient(
          180deg,
          transparent,
          transparent 60px,
          rgba(60, 25, 5, 0.04) 60px,
          rgba(60, 25, 5, 0.04) 61px
        )`,
      }} />

      {/* ── Vignette: darker edges, warm lit center ── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 90% 75% at 58% 40%,
            rgba(180, 80, 10, 0.06) 0%,
            rgba(120, 40, 5, 0.04) 40%,
            rgba(8, 3, 1, 0.55) 100%
          )
        `,
      }} />

      {/* ── Bottom "stage floor" warm bounce light ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%',
        background: 'linear-gradient(0deg, rgba(180,80,10,0.08) 0%, transparent 100%)',
      }} />

    </div>
  );
}
