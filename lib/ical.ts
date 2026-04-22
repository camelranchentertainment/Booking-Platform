export function buildIcal(
  shows: any[],
  calendarName: string,
  actNameFn?: (actId: string) => string,
): string {
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const events = shows.map(s => {
    const date = s.show_date?.substring(0, 10);
    if (!date) return '';

    const [y, m, d] = date.split('-');
    let dtstart: string;
    let dtend: string;

    if (s.set_time) {
      const match = s.set_time.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (match) {
        let h = parseInt(match[1]);
        const min = match[2].padStart(2, '0');
        const ap = match[3]?.toUpperCase();
        if (ap === 'PM' && h < 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
        const hs = String(h).padStart(2, '0');
        const endH = String((h + 2) % 24).padStart(2, '0');
        dtstart = `DTSTART:${y}${m}${d}T${hs}${min}00`;
        dtend   = `DTEND:${y}${m}${d}T${endH}${min}00`;
      } else {
        dtstart = `DTSTART;VALUE=DATE:${y}${m}${d}`;
        dtend   = nextDay(y, m, d);
      }
    } else {
      dtstart = `DTSTART;VALUE=DATE:${y}${m}${d}`;
      dtend   = nextDay(y, m, d);
    }

    const actName  = actNameFn ? actNameFn(s.act_id) : '';
    const venue    = s.venue?.name || 'TBD';
    const location = s.venue
      ? [venue, s.venue.city, s.venue.state].filter(Boolean).join(', ')
      : venue;
    const summary  = actName ? `${actName} @ ${venue}` : venue;

    const desc: string[] = [];
    if (s.status)       desc.push(`Status: ${s.status}`);
    if (s.load_in_time) desc.push(`Load-in: ${s.load_in_time}`);
    if (s.set_time)     desc.push(`Set time: ${s.set_time}`);
    if (s.fee)          desc.push(`Fee: $${Number(s.fee).toLocaleString()}`);

    return [
      'BEGIN:VEVENT',
      `UID:booking-${s.id}@camelranchbooking.com`,
      `DTSTAMP:${now}`,
      dtstart,
      dtend,
      `SUMMARY:${escape(summary)}`,
      `LOCATION:${escape(location)}`,
      desc.length ? `DESCRIPTION:${desc.join('\\n')}` : '',
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  }).filter(Boolean);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Camel Ranch Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calendarName}`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcal(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function nextDay(y: string, m: string, d: string): string {
  const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d) + 1);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `DTEND;VALUE=DATE:${ny}${nm}${nd}`;
}

function escape(s: string): string {
  return s.replace(/[,;\\]/g, c => `\\${c}`).replace(/\n/g, '\\n');
}
