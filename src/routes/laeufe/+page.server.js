import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db.js';
import { segmentResults, deleteSegment } from '$lib/server/segments.js';
import { intervalHistory, zoneHistory } from '$lib/server/laps.js';
import { autoNameRoutes } from '$lib/server/route-names.js';

export function load({ url }) {
  const db = getDb();
  autoNameRoutes();
  const routes = db.prepare(`SELECT r.id, r.name, r.auto_name, COUNT(a.id) AS n, AVG(a.distance_m) AS dist
    FROM route r JOIN activity a ON a.route_id = r.id GROUP BY r.id ORDER BY n DESC`).all();
  const sel = Number(url.searchParams.get('route')) || routes[0]?.id;
  const runs = db.prepare(`SELECT id, start_time, local_date, duration_s, distance_m, avg_hr, max_hr, ascent_m, avg_speed
    FROM activity WHERE type = 'run' AND route_id = ? ORDER BY start_time`).all(sel);
  return { routes, sel, runs, segments: sel ? segmentResults(sel) : [], intervals: sel ? intervalHistory(sel) : [], zones: sel ? zoneHistory(sel) : [] };
}

export const actions = {
  rename: async ({ request }) => {
    const f = await request.formData();
    const id = Number(f.get('id')), name = String(f.get('name') || '').trim();
    if (!id || !name) return fail(400, { error: 'Name fehlt' });
    getDb().prepare('UPDATE route SET name = ?, auto_name = 0 WHERE id = ?').run(name, id);
    return { ok: true };
  },
  autoName: async ({ request }) => {
    const f = await request.formData();
    getDb().prepare('UPDATE route SET auto_name = 1 WHERE id = ?').run(Number(f.get('id')));
    return { ok: true };
  },
  deleteSegment: async ({ request }) => {
    const f = await request.formData();
    deleteSegment(Number(f.get('id')));
    return { ok: true };
  }
};
