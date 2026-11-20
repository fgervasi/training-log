import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db.js';
import { exerciseLabels } from '$lib/server/queries.js';
import { plansOn } from '$lib/server/notion-links.js';

export function load({ params }) {
  const db = getDb();
  const a = db.prepare("SELECT * FROM activity WHERE id = ? AND type = 'tabata'").get(params.id);
  if (!a) error(404, 'Einheit nicht gefunden');
  const sets = db.prepare('SELECT * FROM strength_set WHERE activity_id = ? ORDER BY idx').all(a.id);
  // vorige Einheit mit denselben Übungen zum Vergleich
  const exKey = [...new Set(sets.filter((s) => s.round > 0).map((s) => s.exercise))].sort().join(',');
  const prevCandidates = db.prepare(`SELECT a.id, a.start_time, GROUP_CONCAT(DISTINCT s.exercise) AS ex FROM activity a JOIN strength_set s ON s.activity_id = a.id
    WHERE a.type = 'tabata' AND a.start_time < ? AND s.round > 0 GROUP BY a.id ORDER BY a.start_time DESC LIMIT 30`).all(a.start_time);
  const prev = prevCandidates.find((p) => p.ex.split(',').sort().join(',') === exKey);
  const prevSets = prev ? db.prepare('SELECT * FROM strength_set WHERE activity_id = ? ORDER BY idx').all(prev.id) : [];
  return { a, sets, prev, prevSets, plans: plansOn(a.local_date), labels: exerciseLabels() };
}
