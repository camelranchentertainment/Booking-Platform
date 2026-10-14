// components/venues/StateTileGrid.tsx
import { useEffect, useRef, useState } from 'react';
import { balancedTileGrid, maxTileColumns, STATE_TILE_GAP } from '../../lib/stateTileGrid';

/** Widest a tile grows when there is spare room (px). */
const TILE_MAX_WIDTH = 170;

export interface StateTileSummary {
  /** Two-letter state code (or the placeholder used for venues without one). */
  state: string;
  venueCount: number;
  emailCount: number;
}

interface Props {
  tiles: StateTileSummary[];
  /** The state whose venue list is open, or null. */
  selected: string | null;
  /** Called with the clicked state; the parent decides whether that opens or closes it. */
  onSelect: (state: string) => void;
  /** id of the venue-list panel each tile opens, for aria-controls. */
  panelId: string;
}

/**
 * Compact, evenly balanced grid of state tiles for the Venues "By State" view.
 *
 * The grid measures its own width and asks `balancedTileGrid` for a row and
 * column count, so 14 states sit as 7 + 7 and 4 as 2 + 2 at any screen size.
 * Each tile is a real button (keyboard and screen-reader friendly) that
 * reports whether its venue list is open.
 */
export default function StateTileGrid({ tiles, selected, onSelect, panelId }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // A sensible desktop guess until the first measurement lands.
  const [maxCols, setMaxCols] = useState(8);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setMaxCols(maxTileColumns(el.clientWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { cols } = balancedTileGrid(tiles.length, maxCols);

  return (
    <div
      ref={ref}
      className="state-tile-grid"
      style={{ gridTemplateColumns: `repeat(${Math.max(cols, 1)}, minmax(0, ${TILE_MAX_WIDTH}px))`, gap: STATE_TILE_GAP }}
    >
      <style>{`
        .state-tile-grid { display:grid; justify-content:start; margin-bottom:0.75rem; }
        .state-tile {
          display:flex; flex-direction:column; align-items:flex-start; gap:0.15rem;
          position:relative; min-height:84px; padding:0.7rem 0.8rem; text-align:left;
          background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--radius, 8px);
          color:var(--text-primary); font:inherit; cursor:pointer;
          transition:border-color 0.15s, transform 0.15s, background 0.15s;
        }
        .state-tile:hover { border-color:var(--accent); transform:translateY(-1px); }
        .state-tile:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
        .state-tile[aria-expanded="true"] { border-color:var(--accent); background:var(--accent-glow); }
        .state-tile-code { font-family:var(--font-display); font-size:1.6rem; line-height:1; letter-spacing:0.06em; color:var(--accent); }
        .state-tile-count { font-family:var(--font-mono); font-size:0.74rem; color:var(--text-muted); }
        .state-tile-email { font-family:var(--font-mono); font-size:0.7rem; color:#34d399; }
        .state-tile-chev  { position:absolute; top:0.65rem; right:0.7rem; font-family:var(--font-mono); font-size:0.9rem; color:var(--text-muted); transition:transform 0.15s; }
        .state-tile[aria-expanded="true"] .state-tile-chev { transform:rotate(90deg); color:var(--accent); }
        @media (prefers-reduced-motion: reduce) {
          .state-tile, .state-tile-chev { transition:none; }
          .state-tile:hover { transform:none; }
        }
      `}</style>
      {tiles.map(({ state, venueCount, emailCount }) => {
        const open = state === selected;
        return (
          <button
            key={state}
            type="button"
            className="state-tile"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-label={`${state}: ${venueCount} venue${venueCount !== 1 ? 's' : ''}${emailCount > 0 ? `, ${emailCount} with email` : ''}`}
            onClick={() => onSelect(state)}
          >
            <span className="state-tile-code" aria-hidden="true">{state}</span>
            <span className="state-tile-count" aria-hidden="true">
              {venueCount} venue{venueCount !== 1 ? 's' : ''}
            </span>
            {emailCount > 0 && (
              <span className="state-tile-email" aria-hidden="true">✉ {emailCount} with email</span>
            )}
            <span className="state-tile-chev" aria-hidden="true">›</span>
          </button>
        );
      })}
    </div>
  );
}
