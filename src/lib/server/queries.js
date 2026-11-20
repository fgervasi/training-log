import { getDb } from './db.js';
import { prettyExercise } from '$lib/format.js';

/** Anzeigename je Garmin-Übung: eigener Name > Notion-Übung > Garmin-Name */
export function exerciseLabels() {
  const db = getDb();
  const rows = db.prepare(`SELECT s.exercise, MAX(s.exercise_name) AS garmin, MAX(s.category) AS category, m.label, p.title AS notion, m.notion_page_id
    FROM strength_set s LEFT JOIN exercise_map m ON m.exercise = s.exercise LEFT JOIN notion_page p ON p.id = m.notion_page_id
    GROUP BY s.exercise`).all();
  return Object.fromEntries(rows.map((r) => [r.exercise, { label: r.label || r.notion || prettyExercise(r.garmin ?? r.category), garmin: prettyExercise(r.garmin ?? r.category), notion: r.notion, mapped: !!(r.label || r.notion_page_id) }]));
}

/** Montag der Woche (YYYY-MM-DD) zu einem lokalen Datum */
export function weekOf(localDate) {
  const d = new Date(localDate + 'T12:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

/** Punkte für den Client ausdünnen: ungefähr alle `step` Meter */
export function thinPoints(points, step = 10) {
  const out = [];
  let last = -Infinity;
  for (const p of points) {
    if (p.dist_m == null || p.dist_m - last >= step) { out.push(p); last = p.dist_m ?? last; }
  }
  if (points.length && out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

export function runPoints(id) {
  return thinPoints(getDb().prepare('SELECT t, lat, lon, alt_m, hr, speed, dist_m FROM run_point WHERE activity_id = ? ORDER BY t').all(id));
}
