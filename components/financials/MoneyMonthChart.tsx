// components/financials/MoneyMonthChart.tsx
//
// Money by month for the selected year: three bars per month — earned (paid
// shows), on the books (confirmed shows still to play) and expenses — on one
// shared dollar scale. Plain HTML/CSS, no chart library.
//
// Colours were checked together with the dataviz palette validator against the
// dark surface (#1d3156): earned #d9752d, on the books #4a90e2, expenses
// #e05a8a (lightness band, chroma, CVD and contrast all pass). Each month has a
// hover/focus tooltip with the net, and the whole chart has a screen-reader
// table.

import type { MonthMoney } from '../../lib/domain/financials';
import { money } from '../analytics/charts';
import styles from '../../styles/financials.module.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Scale top whose quarters are round numbers ($600 steps, $1k steps…), so the axis labels read cleanly. */
function niceMax(n: number): number {
  if (n <= 0) return 100;
  const quarter = n / 4;
  const mag = 10 ** Math.floor(Math.log10(quarter));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const q = (steps.find(s => quarter <= s * mag) ?? 10) * mag;
  return q * 4;
}

const short = (n: number) => (n >= 1000 ? `$${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })}k` : `$${Math.round(n)}`);

export default function MoneyMonthChart({ months, year, currentMonth }: { months: MonthMoney[]; year: number; currentMonth: number | null }) {
  const top = niceMax(Math.max(0, ...months.flatMap(m => [m.earned, m.booked, m.expenses])));
  const any = months.some(m => m.earned || m.booked || m.expenses);
  const h = (v: number) => `${(v / top) * 100}%`;
  const totals = months.reduce(
    (t, m) => ({ earned: t.earned + m.earned, booked: t.booked + m.booked, expenses: t.expenses + m.expenses }),
    { earned: 0, booked: 0, expenses: 0 },
  );

  return (
    <figure className={styles.chart}>
      <div className={styles.legend} aria-hidden="true">
        <span><i className={styles.swEarned} />Earned <b>{money(totals.earned)}</b></span>
        <span><i className={styles.swBooked} />On the books <b>{money(totals.booked)}</b></span>
        <span><i className={styles.swExpense} />Expenses <b>{money(totals.expenses)}</b></span>
      </div>
      <div className={styles.plotWrap}>
        <div className={styles.axis} aria-hidden="true">
          {[1, 0.75, 0.5, 0.25, 0].map(f => <span key={f}>{short(top * f)}</span>)}
        </div>
        <div className={styles.plot}>
          <div className={styles.gridLines} aria-hidden="true"><span /><span /><span /><span /><span /></div>
          {months.map(m => {
            const label = `${MONTHS[m.month]} ${year}: ${money(m.earned)} earned, ${money(m.booked)} on the books, ${money(m.expenses)} expenses, net ${money(m.net)}`;
            return (
              <div
                key={m.month}
                className={`${styles.col} ${m.month === currentMonth ? styles.colNow : ''}`}
                tabIndex={0}
                aria-label={label}
              >
                <div className={styles.bars}>
                  <span className={styles.barEarned} style={{ height: h(m.earned) }} />
                  <span className={styles.barBooked} style={{ height: h(m.booked) }} />
                  <span className={styles.barExpense} style={{ height: h(m.expenses) }} />
                </div>
                <span className={styles.colName} aria-hidden="true">
                  <span className={styles.monthLong}>{MONTHS[m.month]}</span>
                  <span className={styles.monthShort}>{MONTHS[m.month][0]}</span>
                </span>
                <span className={styles.tip} role="tooltip">
                  <strong>{MONTHS[m.month]} {year}</strong>
                  <span><i className={styles.swEarned} />{money(m.earned)} earned</span>
                  <span><i className={styles.swBooked} />{money(m.booked)} on the books</span>
                  <span><i className={styles.swExpense} />{money(m.expenses)} expenses</span>
                  {m.owed > 0 && <span>{money(m.owed)} still owed</span>}
                  <span className={styles.tipNet}>Net {money(m.net)}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {!any && <p className={styles.chartEmpty}>No money in or out for {year} yet.</p>}
      <table className={styles.srOnly}>
        <caption>Money by month, {year}</caption>
        <thead>
          <tr><th scope="col">Month</th><th scope="col">Earned</th><th scope="col">On the books</th><th scope="col">Expenses</th><th scope="col">Net</th></tr>
        </thead>
        <tbody>
          {months.map(m => (
            <tr key={m.month}>
              <th scope="row">{MONTHS[m.month]}</th>
              <td>{money(m.earned)}</td><td>{money(m.booked)}</td><td>{money(m.expenses)}</td><td>{money(m.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
