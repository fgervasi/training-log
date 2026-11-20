// Tabata-Sätze aus den gespeicherten FIT-Dateien neu berechnen, wenn sich die Erkennung
// von Runden/Blöcken ändert. Aktivitäten, Läufe und Zuordnungen bleiben unverändert.
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR } from './paths.js';
import { parseSets } from './fit.js';

export const SETS_VERSION = 2;

export function reprocessSets(db) {
  const acts = db.prepare("SELECT id, source_file FROM activity WHERE type = 'tabata'").all();
  const del = db.prepare('DELETE FROM strength_set WHERE activity_id = ?');
  const ins = db.prepare(`INSERT INTO strength_set (activity_id, idx, round, pos, start_time, duration_s, exercise, category, exercise_name, reps, avg_hr, max_hr)
    VALUES (@activity_id, @idx, @round, @pos, @start_time, @duration_s, @exercise, @category, @exercise_name, @reps, @avg_hr, @max_hr)`);
  let n = 0;
  db.transaction(() => {
    for (const a of acts) {
      const file = path.join(RAW_DIR, a.source_file);
      if (!fs.existsSync(file)) continue;
      const sets = parseSets(fs.readFileSync(file));
      if (!sets) continue;
      del.run(a.id);
      for (const s of sets) ins.run({ ...s, activity_id: a.id });
      n++;
    }
  })();
  return n;
}
