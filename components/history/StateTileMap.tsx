// components/history/StateTileMap.tsx
//
// Where the band has played: a US tile map (one square per state, laid out
// like the country) shaded by how many shows were played there. States not
// played stay dim. Each played tile is focusable with a tooltip, and a
// screen-reader list gives the same counts. Clicking a played state filters
// the history to it.
//
// Shading is one hue (the accent orange) in four steps of opacity, so it
// reads as "more" without a second colour; the count is printed on every
// played tile, so colour never carries the meaning alone.

import { STATE_TILES } from '../../lib/domain/history';
import styles from '../../styles/history.module.css';

interface Props {
  counts: Map<string, number>;
  selected: string;
  onSelect: (state: string) => void;
}

/** 1–4 intensity step for a count, relative to the busiest state. */
function step(n: number, max: number): number {
  if (n <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((n / max) * 4)));
}

export default function StateTileMap({ counts, selected, onSelect }: Props) {
  const max = Math.max(0, ...counts.values());
  const played = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const unknown = played.filter(([s]) => !STATE_TILES[s]);

  return (
    <figure className={styles.mapFigure}>
      <div className={styles.map} role="group" aria-label="States played. Choose one to filter the history.">
        {Object.entries(STATE_TILES).map(([state, [col, row]]) => {
          const n = counts.get(state) ?? 0;
          const s = step(n, max);
          const on = selected === state;
          const style = { gridColumn: col + 1, gridRow: row + 1 };
          if (!n) {
            return <span key={state} className={styles.tile} style={style} aria-hidden="true"><span className={styles.tileCode}>{state}</span></span>;
          }
          return (
            <button
              key={state}
              type="button"
              className={`${styles.tile} ${styles.tilePlayed} ${styles[`heat${s}`]} ${on ? styles.tileOn : ''}`}
              style={style}
              aria-pressed={on}
              aria-label={`${state}: ${n} ${n === 1 ? 'show' : 'shows'}${on ? ', filtering' : ''}`}
              onClick={() => onSelect(on ? '' : state)}
            >
              <span className={styles.tileCode}>{state}</span>
              <span className={styles.tileCount}>{n}</span>
            </button>
          );
        })}
      </div>
      <figcaption className={styles.mapLegend}>
        <span>Fewer</span>
        {[1, 2, 3, 4].map(s => <i key={s} className={`${styles.legendSwatch} ${styles[`heat${s}`]}`} aria-hidden="true" />)}
        <span>More shows</span>
        {unknown.length > 0 && <span className={styles.mapNote}>Also: {unknown.map(([s, n]) => `${s} (${n})`).join(', ')}</span>}
      </figcaption>
      <ul className={styles.srOnly}>
        {played.map(([s, n]) => <li key={s}>{s}: {n} {n === 1 ? 'show' : 'shows'}</li>)}
      </ul>
    </figure>
  );
}
