import { getDb } from '$lib/server/db.js';
import { exerciseLabels, repLimits, markReps } from '$lib/server/queries.js';
import { planFor } from '$lib/server/notion-links.js';
import { toBlocks, blockSummary } from '$lib/blocks.js';

export function load({ url }) {
  const db = getDb();
  const sessions = db.prepare(`SELECT a.id, a.start_time, a.local_date, a.duration_s, a.avg_hr, a.max_hr, a.training_effect,
      MAX(s.round) AS rounds, SUM(s.round > 0) AS intervals, SUM(CASE WHEN s.round > 0 THEN s.reps END) AS reps,
      SUM(s.round > 0 AND s.reps IS NOT NULL) AS counted,
      GROUP_CONCAT(DISTINCT CASE WHEN s.round > 0 THEN s.exercise END) AS exercises
    FROM activity a JOIN strength_set s ON s.activity_id = a.id WHERE a.type = 'tabata' GROUP BY a.id ORDER BY a.start_time DESC`).all()
    .map((s) => ({ ...s, plan: planFor(s.local_date, 'strength')?.title ?? null }));
  const limits = repLimits();
  const setsOf = db.prepare('SELECT round, pos, exercise, reps FROM strength_set WHERE activity_id = ? AND round > 0');
  for (const s of sessions) {
    const ss = markReps(setsOf.all(s.id), limits);
    s.blocks = blockSummary(toBlocks(ss));
    s.reps = ss.reduce((a, x) => a + (x.reps_ok ?? 0), 0);
    s.bad = ss.filter((x) => x.bad).length;
  }

  // Gleiche Übungsfolge = gleiches Programm (Garmin-Workout)
  const programs = {};
  for (const s of [...sessions].reverse()) {
    const key = s.exercises?.split(',').sort().join(',') ?? '';
    programs[key] ??= { key, n: 0, first: s.local_date, last: s.local_date, plans: new Set() };
    programs[key].n++; programs[key].last = s.local_date;
    if (s.plan) programs[key].plans.add(s.plan);
    s.program = key;
  }
  const progList = Object.values(programs).sort((a, b) => b.first.localeCompare(a.first))
    .map((p, i, arr) => ({ ...p, plans: [...p.plans], label: p.plans.size ? [...p.plans][0] : `Programm ${arr.length - i}` }));
  const progLabel = Object.fromEntries(progList.map((p) => [p.key, p.label]));
  for (const s of sessions) s.programLabel = progLabel[s.program];

  const exercises = db.prepare(`SELECT exercise, COUNT(DISTINCT activity_id) AS sessions, MAX(start_time) AS last, COUNT(reps) AS counted
    FROM strength_set WHERE round > 0 GROUP BY exercise ORDER BY last DESC, sessions DESC`).all();
  const ex = url.searchParams.get('ex') || exercises[0]?.exercise;
  const sets = markReps(db.prepare(`SELECT s.activity_id, a.start_time, s.round, s.exercise, s.reps, s.avg_hr FROM strength_set s JOIN activity a ON a.id = s.activity_id
    WHERE s.exercise = ? AND s.round > 0 ORDER BY a.start_time, s.round`).all(ex), limits);

  return { sessions, programs: progList, exercises, ex, sets, labels: exerciseLabels() };
}
