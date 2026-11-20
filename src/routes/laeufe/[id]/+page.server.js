import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db.js';
import { runPoints } from '$lib/server/queries.js';

export function load({ params, url }) {
  const db = getDb();
  const run = db.prepare(`SELECT a.*, r.name AS route FROM activity a LEFT JOIN route r ON r.id = a.route_id WHERE a.id = ? AND a.type = 'run'`).get(params.id);
  if (!run) error(404, 'Lauf nicht gefunden');
  const others = db.prepare(`SELECT id, start_time, duration_s, avg_hr FROM activity WHERE type = 'run' AND route_id = ? AND id != ? ORDER BY start_time DESC`).all(run.route_id, run.id);
  // Standardvergleich: der Lauf davor auf derselben Route
  const prev = others.find((o) => o.start_time < run.start_time) ?? others[0];
  const vsParam = url.searchParams.get('vs');
  const vsId = vsParam === 'none' ? null : Number(vsParam) || prev?.id || null;
  const vs = vsId ? db.prepare('SELECT * FROM activity WHERE id = ?').get(vsId) : null;
  return { run, points: runPoints(run.id), others, vs, vsPoints: vs ? runPoints(vs.id) : [] };
}
