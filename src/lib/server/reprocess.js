// Tabata-Sätze aus den gespeicherten FIT-Dateien neu berechnen, wenn sich die Erkennung
// von Runden/Blöcken ändert. Aktivitäten, Läufe und Zuordnungen bleiben unverändert.
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR } from './paths.js';
import { parseSets, parseRunExtras, parseFit } from './fit.js';

// 2: Runden nach Übungsfolge, 3: Laps und Workout-Namen
export const SETS_VERSION = 3;

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
    // Läufe: Runden und Workout-Namen; Tabata: Workout-Namen
    const setWorkout = db.prepare('UPDATE activity SET workout = ? WHERE id = ?');
    const delLap = db.prepare('DELETE FROM lap WHERE activity_id = ?');
    for (const a of db.prepare('SELECT id, type, source_file FROM activity').all()) {
      const file = path.join(RAW_DIR, a.source_file);
      if (!fs.existsSync(file)) continue;
      const buf = fs.readFileSync(file);
      if (a.type === 'run') {
        const x = parseRunExtras(buf);
        if (!x) continue;
        setWorkout.run(x.workout, a.id);
        delLap.run(a.id);
        insertLaps(db, a.id, x.laps);
      } else {
        setWorkout.run(parseFit(buf)?.session.workout ?? null, a.id);
      }
    }
  })();
  return n;
}

export function insertLaps(db, activityId, laps) {
  const ins = db.prepare(`INSERT INTO lap (activity_id, idx, intensity, step_index, start_t, duration_s, distance_m, start_dist, avg_hr, max_hr, avg_speed, ascent_m, target_hr_low, target_hr_high)
    VALUES (@activity_id, @idx, @intensity, @step_index, @start_t, @duration_s, @distance_m, @start_dist, @avg_hr, @max_hr, @avg_speed, @ascent_m, @target_hr_low, @target_hr_high)`);
  for (const l of laps) ins.run({ ...l, activity_id: activityId });
}
