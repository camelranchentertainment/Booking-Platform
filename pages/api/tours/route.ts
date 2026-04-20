import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

type Stop = {
  booking_id: string;
  venue_name: string;
  city: string;
  state: string;
  place_id?: string | null;
  show_date?: string | null;
  drive_to_next?: { minutes: number; miles: number } | null;
};

// Nearest-neighbor TSP heuristic
function nearestNeighbor(matrix: number[][], start = 0): number[] {
  const n = matrix.length;
  const visited = new Array(n).fill(false);
  const route = [start];
  visited[start] = true;
  for (let i = 1; i < n; i++) {
    const cur = route[route.length - 1];
    let best = -1, bestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && matrix[cur][j] < bestDist) {
        bestDist = matrix[cur][j];
        best = j;
      }
    }
    route.push(best);
    visited[best] = true;
  }
  return route;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { tour_id } = req.query;
  if (!tour_id) return res.status(400).json({ error: 'tour_id required' });

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Google Maps API key not configured' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(authHeader.slice(7));
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: bookings, error } = await service
    .from('bookings')
    .select('id, show_date, venue:venues(id, name, city, state, place_id)')
    .eq('tour_id', tour_id)
    .order('show_date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const stops: Stop[] = ((bookings as any[]) || [])
    .filter((b: any) => b.venue?.city)
    .map((b: any) => ({
      booking_id: b.id,
      venue_name: b.venue.name,
      city: b.venue.city,
      state: b.venue.state,
      place_id: b.venue.place_id,
      show_date: b.show_date,
    }));

  if (stops.length < 2) {
    return res.json({ current: stops, current_total_minutes: 0, optimized: stops, optimized_total_minutes: 0, savings_minutes: 0 });
  }

  const addresses = stops.map(s =>
    s.place_id ? `place_id:${s.place_id}` : `${s.city}, ${s.state}`
  );

  const param = addresses.join('|');
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(param)}&destinations=${encodeURIComponent(param)}&units=imperial&key=${apiKey}`;

  const dmRes = await fetch(url);
  const dm = await dmRes.json();

  if (dm.status !== 'OK') {
    return res.status(500).json({ error: `Distance Matrix: ${dm.status}` });
  }

  const n = stops.length;
  const mins: number[][] = [];
  const miles: number[][] = [];

  for (let i = 0; i < n; i++) {
    mins[i] = [];
    miles[i] = [];
    for (let j = 0; j < n; j++) {
      const el = dm.rows[i]?.elements[j];
      if (el?.status === 'OK') {
        mins[i][j] = Math.round(el.duration.value / 60);
        miles[i][j] = Math.round(el.distance.value / 1609.34);
      } else {
        mins[i][j] = 9999;
        miles[i][j] = 9999;
      }
    }
  }

  // Current route legs (date order)
  let currentTotal = 0;
  const current: Stop[] = stops.map((s, i) => {
    const leg = i < n - 1 ? { minutes: mins[i][i + 1], miles: miles[i][i + 1] } : null;
    if (leg) currentTotal += leg.minutes;
    return { ...s, drive_to_next: leg };
  });

  // Optimized route (nearest-neighbor)
  const order = nearestNeighbor(mins, 0);
  let optimizedTotal = 0;
  const optimized: Stop[] = order.map((idx, pos) => {
    const s = stops[idx];
    const nextIdx = pos < n - 1 ? order[pos + 1] : -1;
    const leg = nextIdx >= 0 ? { minutes: mins[idx][nextIdx], miles: miles[idx][nextIdx] } : null;
    if (leg) optimizedTotal += leg.minutes;
    return { ...s, drive_to_next: leg };
  });

  res.json({
    current,
    current_total_minutes: currentTotal,
    optimized,
    optimized_total_minutes: optimizedTotal,
    savings_minutes: currentTotal - optimizedTotal,
  });
}
