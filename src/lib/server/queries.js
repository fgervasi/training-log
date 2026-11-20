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

/**
 * Zählfehler erkennen: Wiederholungen weit über dem Üblichen für diese Übung
 * (mehr als das Doppelte des Medians und mindestens 8 darüber) gelten als unplausibel.
 */
export function repLimits() {
  const rows = getDb().prepare('SELECT exercise, reps FROM strength_set WHERE round > 0 AND reps IS NOT NULL ORDER BY exercise, reps').all();
  const by = {};
  for (const r of rows) (by[r.exercise] ??= []).push(r.reps);
  return Object.fromEntries(Object.entries(by).map(([e, v]) => {
    const med = v[Math.floor(v.length / 2)];
    return [e, Math.max(med * 2, med + 8)];
  }));
}

/** Ergänzt `bad` (vermutlich Zählfehler) und `reps_ok` (Wiederholungen ohne Zählfehler) */
export function markReps(sets, limits = repLimits()) {
  return sets.map((s) => {
    const bad = s.reps != null && limits[s.exercise] != null && s.reps > limits[s.exercise];
    return { ...s, bad, reps_ok: bad ? null : s.reps };
  });
}
