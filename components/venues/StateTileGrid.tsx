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
 * reports whether its venue list is open. Styles live in styles/globals.css
 * (`.state-tile*`, Venues section).
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
            {/* Booking-email coverage for the state; the numbers are in the aria-label. */}
            <span className="state-tile-meter" aria-hidden="true">
              <span className="state-tile-meter-bar" style={{ width: `${venueCount ? Math.round((emailCount / venueCount) * 100) : 0}%` }} />
            </span>
            <span className="state-tile-email" aria-hidden="true">
              {emailCount > 0 ? `${emailCount} with email` : 'No emails yet'}
            </span>
            <span className="state-tile-chev" aria-hidden="true">›</span>
          </button>
        );
      })}
    </div>
  );
}
