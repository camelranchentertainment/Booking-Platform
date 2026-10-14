// __tests__/lib/stateTileGrid.test.ts
import { balancedTileGrid, maxTileColumns } from '../../lib/stateTileGrid';

describe('balancedTileGrid', () => {
  it.each([
    // count, maxCols, rows, cols
    [14, 10, 2, 7],  // 7 + 7
    [13, 10, 2, 7],  // 7 + 6
    [4, 10, 2, 2],   // 2 + 2
    [9, 10, 2, 5],   // 5 + 4
    [36, 10, 4, 9],  // 9 × 4
    [50, 10, 5, 10], // every state
    [3, 10, 1, 3],   // small sets stay on one row
    [1, 10, 1, 1],
  ])('%i tiles with room for %i → %i rows × %i cols', (count, maxCols, rows, cols) => {
    expect(balancedTileGrid(count, maxCols)).toEqual({ rows, cols });
  });

  it('never exceeds the available columns on narrow screens', () => {
    for (let count = 1; count <= 60; count++) {
      for (let maxCols = 1; maxCols <= 12; maxCols++) {
        const { rows, cols } = balancedTileGrid(count, maxCols);
        expect(cols).toBeLessThanOrEqual(maxCols);
        expect(rows * cols).toBeGreaterThanOrEqual(count);
        // the last row is never emptier than one tile short of a full row's worth per row
        expect(rows * cols - count).toBeLessThan(rows);
      }
    }
  });

  it('stacks into one column when only one fits', () => {
    expect(balancedTileGrid(5, 1)).toEqual({ rows: 5, cols: 1 });
  });

  it('handles empty and bad input', () => {
    expect(balancedTileGrid(0, 10)).toEqual({ rows: 0, cols: 0 });
    expect(balancedTileGrid(-3, 10)).toEqual({ rows: 0, cols: 0 });
    expect(balancedTileGrid(6, 0)).toEqual({ rows: 6, cols: 1 });
    expect(balancedTileGrid(6, NaN)).toEqual({ rows: 6, cols: 1 });
  });
});

describe('maxTileColumns', () => {
  it('fits as many 150px tiles with 10px gaps as the width allows', () => {
    expect(maxTileColumns(1330)).toBe(8);
    expect(maxTileColumns(1590)).toBe(10);
    expect(maxTileColumns(320)).toBe(2);
    expect(maxTileColumns(150)).toBe(1);
  });

  it('returns at least one column', () => {
    expect(maxTileColumns(0)).toBe(1);
    expect(maxTileColumns(-50)).toBe(1);
    expect(maxTileColumns(NaN)).toBe(1);
  });
});
