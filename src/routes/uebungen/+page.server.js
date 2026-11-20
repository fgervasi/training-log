import { getDb } from '$lib/server/db.js';
import { pagesOf, schemaOf } from '$lib/server/notion-links.js';
import { prettyExercise } from '$lib/format.js';

export function load() {
  const db = getDb();
  const rows = db.prepare(`SELECT s.exercise, MAX(s.exercise_name) AS garmin, s.category, COUNT(DISTINCT s.activity_id) AS sessions, MAX(a.local_date) AS last,
      ROUND(AVG(s.reps), 1) AS avg_reps, m.notion_page_id, m.label
    FROM strength_set s JOIN activity a ON a.id = s.activity_id LEFT JOIN exercise_map m ON m.exercise = s.exercise
    WHERE s.round > 0 GROUP BY s.exercise ORDER BY last DESC, sessions DESC`).all()
    .map((r) => ({ ...r, garminLabel: prettyExercise(r.garmin ?? r.category) }));
  const notion = pagesOf('uebungen').map((p) => ({ id: p.id, title: p.title }));
  return { rows, notion, schema: schemaOf('uebungen') };
}

export const actions = {
  save: async ({ request }) => {
    const f = await request.formData();
    const db = getDb();
    const up = db.prepare(`INSERT INTO exercise_map (exercise, notion_page_id, label) VALUES (?, ?, ?)
      ON CONFLICT(exercise) DO UPDATE SET notion_page_id = excluded.notion_page_id, label = excluded.label`);
    const del = db.prepare('DELETE FROM exercise_map WHERE exercise = ?');
    db.transaction(() => {
      for (const ex of f.getAll('exercise')) {
        const page = String(f.get(`notion:${ex}`) || '') || null;
        const label = String(f.get(`label:${ex}`) || '').trim() || null;
        if (!page && !label) del.run(ex); else up.run(ex, page, label);
      }
    })();
    return { saved: true };
  }
};
