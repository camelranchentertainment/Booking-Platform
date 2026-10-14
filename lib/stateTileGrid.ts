// lib/stateTileGrid.ts
//
// Layout maths for the Venues page's state tiles. Kept free of React/DOM so it
// can be unit-tested. The goal is an even grid: 14 tiles → 7 + 7, 4 → 2 + 2,
// 9 → 5 + 4 — rather than filling every row to the edge and leaving a stub.

/** Narrowest a state tile may get before a row drops a column (px). */
export const STATE_TILE_MIN_WIDTH = 150;
/** Gap between tiles (px). Must match the grid's `gap` in StateTileGrid. */
export const STATE_TILE_GAP = 10;

export interface TileGrid {
  rows: number;
  cols: number;
}

/**
 * How many tiles fit side by side in a container of the given width.
 *
 * @param containerWidth Available width in px (0 or negative is treated as 1 column).
 * @returns At least 1.
 */
export function maxTileColumns(
  containerWidth: number,
  minTileWidth: number = STATE_TILE_MIN_WIDTH,
  gap: number = STATE_TILE_GAP,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 1;
  return Math.max(1, Math.floor((containerWidth + gap) / (minTileWidth + gap)));
}

/**
 * Pick rows and columns so tiles spread evenly over the fewest rows that fit.
 *
 * - 1–3 tiles sit on one row (when they fit).
 * - 4 or more always use at least two rows, so a small set reads as a block
 *   (4 → 2 × 2) instead of a short strip.
 * - Columns are then the smallest count that holds every tile in those rows,
 *   which keeps the last row as full as possible.
 *
 * @param count   Number of tiles.
 * @param maxCols Most columns the container can hold (see maxTileColumns).
 * @returns `{ rows: 0, cols: 0 }` for no tiles; otherwise cols ≤ maxCols.
 */
export function balancedTileGrid(count: number, maxCols: number): TileGrid {
  if (!Number.isFinite(count) || count <= 0) return { rows: 0, cols: 0 };
  const limit = Math.max(1, Math.floor(maxCols) || 1);
  const minRows = Math.ceil(count / limit);
  const rows = count <= 3 ? minRows : Math.max(2, minRows);
  const cols = Math.ceil(count / rows);
  return { rows, cols };
}
