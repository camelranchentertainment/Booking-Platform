export default function BarBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>

      {/* ── Base: deep mahogany ── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, #0A0200 0%, #1C0804 35%, #160604 65%, #0C0302 100%)',
      }} />

      {/* ── Spotlight beams from the ceiling ── */}
      <div className="spot spot-amber" />
      <div className="spot spot-purple" />
      <div className="spot spot-blue" />
      <div className="spot spot-pink" />
      <div className="spot spot-gold" />

      {/* ── Animated ambient light blobs ── */}
      <div className="bar-blob bar-blob-amber" />
      <div className="bar-blob bar-blob-purple" />
      <div className="bar-blob bar-blob-pink" />
      <div className="bar-blob bar-blob-orange" />
      <div className="bar-blob bar-blob-gold" />
      <div className="bar-blob bar-blob-indigo" />

      {/* ── Bokeh / string lights scattered near ceiling ── */}
      <div className="bokeh bk1" /><div className="bokeh bk2" /><div className="bokeh bk3" />
      <div className="bokeh bk4" /><div className="bokeh bk5" /><div className="bokeh bk6" />
      <div className="bokeh bk7" /><div className="bokeh bk8" /><div className="bokeh bk9" />
      <div className="bokeh bk10" /><div className="bokeh bk11" /><div className="bokeh bk12" />
      <div className="bokeh bk13" /><div className="bokeh bk14" /><div className="bokeh bk15" />
      <div className="bokeh bk16" /><div className="bokeh bk17" /><div className="bokeh bk18" />

      {/* ── Crowd silhouettes at the bottom ── */}
      <div className="crowd-wrap">
        <div className="sil sil-1" />
        <div className="sil sil-2" />
        <div className="sil sil-3" />
        <div className="sil sil-4" />
        <div className="sil sil-5" />
        <div className="sil sil-6" />
        <div className="sil sil-7" />
        <div className="sil sil-8" />
        <div className="sil sil-9" />
        <div className="sil sil-10" />
        <div className="sil sil-11" />
      </div>

      {/* ── Smoke / dust particles drifting upward ── */}
      <div className="dust d1" /><div className="dust d2" /><div className="dust d3" />
      <div className="dust d4" /><div className="dust d5" /><div className="dust d6" />
      <div className="dust d7" /><div className="dust d8" /><div className="dust d9" />
      <div className="dust d10" /><div className="dust d11" /><div className="dust d12" />
      <div className="dust d13" /><div className="dust d14" /><div className="dust d15" />

      {/* ── Neon signs ── */}
      <div className="neon-deco neon-live">LIVE MUSIC</div>
      <div className="neon-deco neon-star">★</div>
      <div className="neon-deco neon-bar">BAR</div>
      <div className="neon-deco neon-open">OPEN</div>

      {/* ── Bar counter glow at the very bottom ── */}
      <div className="bar-counter" />

      {/* ── Stage floor bounce light ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
        background: 'linear-gradient(0deg, rgba(200,100,20,0.22) 0%, rgba(180,70,10,0.08) 40%, transparent 100%)',
      }} />

      {/* ── Warm center glow / vignette ── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 80% 65% at 50% 50%,
          rgba(160,70,10,0.14) 0%,
          rgba(100,35,5,0.08) 45%,
          rgba(6,2,1,0.65) 100%
        )`,
      }} />

    </div>
  );
}
