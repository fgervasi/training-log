import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db.js';
import { exerciseLabels, repLimits, markReps } from '$lib/server/queries.js';
import { planFor, planExercises } from '$lib/server/notion-links.js';

export function load({ params }) {
  const db = getDb();
  const a = db.prepare("SELECT * FROM activity WHERE id = ? AND type = 'tabata'").get(params.id);
  if (!a) error(404, 'Einheit nicht gefunden');
  const limits = repLimits();
  const sets = markReps(db.prepare('SELECT * FROM strength_set WHERE activity_id = ? ORDER BY idx').all(a.id), limits);
  // vorige Einheit mit denselben Übungen zum Vergleich
  const exKey = [...new Set(sets.filter((s) => s.round > 0).map((s) => s.exercise))].sort().join(',');
  const prevCandidates = db.prepare(`SELECT a.id, a.start_time, GROUP_CONCAT(DISTINCT s.exercise) AS ex FROM activity a JOIN strength_set s ON s.activity_id = a.id
    WHERE a.type = 'tabata' AND a.start_time < ? AND s.round > 0 GROUP BY a.id ORDER BY a.start_time DESC LIMIT 30`).all(a.start_time);
  const prev = prevCandidates.find((p) => p.ex.split(',').sort().join(',') === exKey);
  const prevSets = prev ? markReps(db.prepare('SELECT * FROM strength_set WHERE activity_id = ? ORDER BY idx').all(prev.id), limits) : [];
  const plan = planFor(a.local_date, 'strength');
  const mapRows = db.prepare('SELECT exercise, notion_page_id, label FROM exercise_map').all();
  const used = new Set(sets.filter((s) => s.round > 0).map((s) => s.exercise));
  const usedNotion = new Set(mapRows.filter((m) => used.has(m.exercise) && m.notion_page_id).map((m) => m.notion_page_id));
  const unmapped = [...used].filter((e) => !mapRows.some((m) => m.exercise === e && (m.notion_page_id || m.label)));
  const planned = planExercises(plan).map((e) => ({ ...e, done: e.uebungen.some((u) => usedNotion.has(u.id)) }))
    .sort((x, y) => y.done - x.done);
  return { a, sets, prev, prevSets, plan: plan && { title: plan.title, url: plan.url, range: plan.range }, planned, unmapped, labels: exerciseLabels() };
}
