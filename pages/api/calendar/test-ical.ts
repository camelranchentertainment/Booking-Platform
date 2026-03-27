import { NextApiRequest, NextApiResponse } from 'next';
import { parseICalData } from './sync';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = req.query.url as string | undefined;
  if (!url) {
    return res.status(400).json({ error: 'url query param required' });
  }

  try {
    console.log(`[test-ical] Fetching: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CalendarSync/1.0)',
        'Accept':     'text/calendar, */*',
      },
    });

    if (!response.ok) {
      return res.status(200).json({
        error: `Fetch failed: ${response.status} ${response.statusText}`,
        url,
      });
    }

    const icalData = await response.text();
    console.log(`[test-ical] Raw data: ${icalData.length} chars`);

    const allEvents = parseICalData(icalData);
    console.log(`[test-ical] Parsed ${allEvents.length} events`);

    // Group by year for quick overview
    const eventsByYear: Record<string, number> = {};
    for (const e of allEvents) {
      const yr = e.date?.substring(0, 4) ?? 'unknown';
      eventsByYear[yr] = (eventsByYear[yr] ?? 0) + 1;
    }

    return res.status(200).json({
      url,
      rawLength: icalData.length,
      rawPreview: icalData.substring(0, 500),
      totalEvents: allEvents.length,
      eventsByYear,
      first10Events: allEvents.slice(0, 10),
    });
  } catch (error) {
    console.error('[test-ical] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      url,
    });
  }
}
