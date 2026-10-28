// components/analytics/charts.tsx
//
// The Analytics page's charts, in plain HTML/CSS (no chart library):
//   MonthChart  — shows per month, played vs still to play (stacked columns)
//   FunnelChart — outreach funnel, pipeline → pitched → wrote back → booked
//   WeeksChart  — emails sent and replies received, last 12 weeks
//   RankBars    — a ranked list with one bar each (states, venues)
//
// Colours (validated for the dark surface with the dataviz palette checker):
// played = #d9752d, booked/sent = #4a90e2, defined as CSS variables in
// styles/analytics.module.css. Every chart has a legend or a title naming its
// one series, a hover/focus tooltip, and a screen-reader table.

import Link from 'next/link';
import styles from '../../styles/analytics.module.css';
import type { FunnelStep, MonthShows, WeekActivity } from '../../lib/domain/analytics';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "$1,250" / "−$480" — whole dollars, minus sign before the dollar sign. */
export const money = (n: number) => `${Math.round(n) < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Shows per month ──────────────────────────────────────────────────────────

export function MonthChart({ months, year, currentMonth }: { months: MonthShows[]; year: number; currentMonth: number | null }) {
  const totals = months.map(m => m.played + m.upcoming);
  const max = Math.max(1, ...totals);
  const peak = totals.indexOf(Math.max(...totals));
  const any = totals.some(t => t > 0);

  return (
    <figure className={styles.chart}>
      <div className={styles.legend} aria-hidden="true">
        <span><i className={styles.swPlayed} />Played</span>
        <span><i className={styles.swBooked} />On the books</span>
      </div>
      <div className={styles.monthPlot} role="presentation">
        <div className={styles.gridLines} aria-hidden="true"><span /><span /><span /><span /></div>
        {months.map((m, i) => {
          const total = totals[i];
          const label = `${MONTHS[m.month]} ${year}: ${plural(m.played, 'show')} played, ${m.upcoming} booked${m.earned ? `, ${money(m.earned)} earned` : ''}`;
          return (
            <div
              key={m.month}
              className={`${styles.monthCol} ${i === currentMonth ? styles.monthNow : ''}`}
              tabIndex={0}
              aria-label={label}
            >
              <div className={styles.stack} style={{ height: `${(total / max) * 100}%` }}>
                {/* column-reverse: the first child (played) sits on the baseline, booked stacks on top */}
                {m.played > 0 && <span className={styles.segPlayed} style={{ flexGrow: m.played }} />}
                {m.upcoming > 0 && <span className={styles.segBooked} style={{ flexGrow: m.upcoming }} />}
              </div>
              {any && i === peak && total > 0 && <span className={styles.peakLabel} style={{ bottom: `calc(${(total / max) * 100}% + 4px)` }}>{total}</span>}
              <span className={styles.monthName} aria-hidden="true"><span className={styles.monthLong}>{MONTHS[m.month]}</span><span className={styles.monthShort}>{MONTHS[m.month][0]}</span></span>
              <span className={styles.tip} role="tooltip">
                <strong>{MONTHS[m.month]} {year}</strong>
                <span><i className={styles.swPlayed} />{m.played} played</span>
                <span><i className={styles.swBooked} />{m.upcoming} booked</span>
                {m.earned > 0 && <span className={styles.tipMoney}>{money(m.earned)} earned</span>}
              </span>
            </div>
          );
        })}
      </div>
      {!any && <p className={styles.chartEmpty}>No shows on the calendar for {year} yet.</p>}
      <table className={styles.srOnly}>
        <caption>Shows per month in {year}</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">Played</th><th scope="col">Booked</th><th scope="col">Earned</th></tr></thead>
        <tbody>
          {months.map(m => (
            <tr key={m.month}><th scope="row">{MONTHS[m.month]}</th><td>{m.played}</td><td>{m.upcoming}</td><td>{money(m.earned)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// ── Outreach funnel ──────────────────────────────────────────────────────────

const FUNNEL_NOTE: Record<FunnelStep['key'], (s: FunnelStep) => string> = {
  pipeline: () => 'tour targets',
  pitched: s => `${s.ofPrevious}% of the pipeline`,
  replied: s => `${s.ofPrevious}% of those pitched`,
  booked: s => `${s.ofTotal}% of the pipeline`,
};

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const total = Math.max(1, steps[0]?.count ?? 0);
  return (
    <ol className={styles.funnel}>
      {steps.map((s, i) => (
        <li key={s.key} className={styles.funnelRow} style={{ ['--step' as string]: i }}>
          <span className={styles.funnelLabel}>{s.label}</span>
          <span className={styles.funnelTrack}>
            <span
              className={`${styles.funnelBar} ${s.key === 'booked' ? styles.funnelBarHot : ''}`}
              style={{ width: `${Math.max(s.count > 0 ? 3 : 0, (s.count / total) * 100)}%` }}
            />
          </span>
          <span className={styles.funnelCount}>{s.count}</span>
          <span className={styles.funnelNote}>{FUNNEL_NOTE[s.key](s)}</span>
        </li>
      ))}
    </ol>
  );
}

// ── Email activity by week ───────────────────────────────────────────────────

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

export function WeeksChart({ weeks }: { weeks: WeekActivity[] }) {
  const max = Math.max(1, ...weeks.map(w => Math.max(w.sent, w.received)));
  const sentTotal = weeks.reduce((s, w) => s + w.sent, 0);
  const repliedTotal = weeks.reduce((s, w) => s + w.received, 0);
  return (
    <figure className={styles.chart}>
      <div className={styles.legend} aria-hidden="true">
        <span><i className={styles.swBooked} />Sent <b>{sentTotal}</b></span>
        <span><i className={styles.swPlayed} />Replies <b>{repliedTotal}</b></span>
      </div>
      <div className={styles.weekPlot}>
        {weeks.map((w, i) => (
          <div key={w.weekStart} className={styles.weekCol} tabIndex={0}
            aria-label={`Week of ${shortDate(w.weekStart)}: ${plural(w.sent, 'email')} sent, ${plural(w.received, 'reply', 'replies')}`}>
            <div className={styles.weekBars}>
              <span className={styles.barSent} style={{ height: `${(w.sent / max) * 100}%` }} />
              <span className={styles.barReply} style={{ height: `${(w.received / max) * 100}%` }} />
            </div>
            <span className={styles.weekName}>{i % 3 === 0 || i === weeks.length - 1 ? shortDate(w.weekStart) : ''}</span>
            <span className={styles.tip} role="tooltip">
              <strong>Week of {shortDate(w.weekStart)}</strong>
              <span><i className={styles.swBooked} />{w.sent} sent</span>
              <span><i className={styles.swPlayed} />{w.received} {w.received === 1 ? 'reply' : 'replies'}</span>
            </span>
          </div>
        ))}
      </div>
      <table className={styles.srOnly}>
        <caption>Emails per week, last 12 weeks</caption>
        <thead><tr><th scope="col">Week of</th><th scope="col">Sent</th><th scope="col">Replies</th></tr></thead>
        <tbody>{weeks.map(w => <tr key={w.weekStart}><th scope="row">{shortDate(w.weekStart)}</th><td>{w.sent}</td><td>{w.received}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

// ── Ranked bars ──────────────────────────────────────────────────────────────

export interface RankItem {
  key: string;
  label: string;
  sub?: string;
  value: number;
  /** Text shown at the end of the row (defaults to the value). */
  display?: string;
  href?: string;
}

/** `color` overrides the bar colour (a validated chart colour, e.g. expenses on Financials). */
export function RankBars({ items, unit, color }: { items: RankItem[]; unit: string; color?: string }) {
  const max = Math.max(1, ...items.map(i => i.value));
  return (
    <ol className={styles.rank}>
      {items.map((it, i) => {
        const inner = (
          <>
            <span className={styles.rankPos}>{i + 1}</span>
            <span className={styles.rankText}>
              <strong>{it.label}</strong>
              {it.sub && <span>{it.sub}</span>}
            </span>
            <span className={styles.rankTrack} aria-hidden="true">
              <span className={styles.rankBar} style={{ width: `${Math.max(4, (it.value / max) * 100)}%`, ...(color ? { background: color } : {}) }} />
            </span>
            <span className={styles.rankValue}>{it.display ?? it.value}<span className={styles.srOnly}> {unit}</span></span>
          </>
        );
        return (
          <li key={it.key}>
            {it.href ? <Link href={it.href} className={styles.rankRow}>{inner}</Link> : <div className={styles.rankRow}>{inner}</div>}
          </li>
        );
      })}
    </ol>
  );
}
