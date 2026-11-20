import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db.js';

export function load({ url }) {
  const db = getDb();
  const routes = db.prepare(`SELECT r.id, r.name, COUNT(a.id) AS n, AVG(a.distance_m) AS dist
    FROM route r JOIN activity a ON a.route_id = r.id GROUP BY r.id ORDER BY n DESC`).all();
  const sel = Number(url.searchParams.get('route')) || routes[0]?.id;
  const runs = db.prepare(`SELECT id, start_time, local_date, duration_s, distance_m, avg_hr, max_hr, ascent_m, avg_speed
    FROM activity WHERE type = 'run' AND route_id = ? ORDER BY start_time`).all(sel);
  return { routes, sel, runs };
}

export const actions = {
  rename: async ({ request }) => {
    const f = await request.formData();
    const id = Number(f.get('id')), name = String(f.get('name') || '').trim();
    if (!id || !name) return fail(400, { error: 'Name fehlt' });
    getDb().prepare('UPDATE route SET name = ? WHERE id = ?').run(name, id);
    return { ok: true };
  }
};
