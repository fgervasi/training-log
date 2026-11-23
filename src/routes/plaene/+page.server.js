import { getDb } from '$lib/server/db.js';
import { strengthPlans, runningPlans, planExercises, planForActivity, stems } from '$lib/server/notion-links.js';
import { exerciseLabels, markReps, weekOf } from '$lib/server/queries.js';
import { lapsOf, zoneTime } from '$lib/server/laps.js';

const NOT_TRACKED = /warm|massage|foam|stretch|mobil|cool|dehn/i;   // diese Arten erfasst die Uhr nicht als Sätze
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/** Läufe, deren Garmin-Workout zum Plan passt (gemeinsame Wortstämme mit Plan- oder Variationsnamen) */
function runsForPlan(db, plan) {
  const keys = stems([plan.title, ...planExercises(plan).map((e) => e.title)].join(' '));
  return db.prepare("SELECT id, start_time, local_date, duration_s, distance_m, avg_hr, workout, route_id FROM activity WHERE type = 'run' AND local_date >= ? AND local_date <= ? ORDER BY start_time")
    .all(plan.range.start, plan.range.end ?? '9999')
    .filter((r) => [...stems(r.workout)].some((s) => keys.has(s)));
}

export function load({ url }) {
  const db = getDb();
  const tabata = db.prepare("SELECT id, local_date, workout FROM activity WHERE type = 'tabata' ORDER BY start_time").all();
  const planOf = new Map(tabata.map((a) => [a.id, planForActivity(a.local_date, a.workout)?.id ?? null]));
  const sPlans = strengthPlans(), rPlans = runningPlans();
  const plans = [
    ...sPlans.map((p) => ({ id: p.id, kind: 'strength', title: p.title, url: p.url, range: p.range, sessions: [...planOf.values()].filter((v) => v === p.id).length })),
    ...rPlans.map((p) => ({ id: p.id, kind: 'run', title: p.title, url: p.url, range: p.range, sessions: runsForPlan(db, p).length }))
  ];
  const sel = plans.find((p) => p.id === url.searchParams.get('id')) ?? plans.find((p) => p.kind === 'strength' && p.sessions) ?? plans[0];
  if (!sel) return { plans, sel: null };

  if (sel.kind === 'run') {
    const plan = rPlans.find((p) => p.id === sel.id);
    const runs = runsForPlan(db, plan).map((r) => {
      const laps = lapsOf(r.id), work = laps.filter((l) => l.work);
      return { ...r, intervals: work.length, work_hr: mean(work.map((l) => l.avg_hr).filter(Boolean)), zone: zoneTime(r.id, laps) };
    });
    const weeks = {};
    for (const r of runs) { const w = weekOf(r.local_date); weeks[w] = (weeks[w] ?? 0) + 1; }
    // lückenlose Wochen vom ersten Lauf bis heute
    const list = [];
    if (runs.length) {
      const last = new Date(weekOf(new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
      for (let d = new Date(weekOf(runs[0].local_date) + 'T12:00:00Z'); d <= last; d.setUTCDate(d.getUTCDate() + 7)) {
        const w = d.toISOString().slice(0, 10); list.push({ week: w, n: weeks[w] ?? 0 });
      }
    }
    return { plans, sel, runs: runs.reverse(), weeks: list, variations: planExercises(plan) };
  }

  const plan = sPlans.find((p) => p.id === sel.id);
  const sessions = tabata.filter((a) => planOf.get(a.id) === sel.id);
  const ids = sessions.map((s) => s.id);
  const sets = ids.length
    ? markReps(db.prepare(`SELECT s.activity_id, s.exercise, s.reps, a.local_date FROM strength_set s JOIN activity a ON a.id = s.activity_id
        WHERE s.round > 0 AND s.activity_id IN (${ids.map(() => '?').join(',')})`).all(...ids))
    : [];
  const map = Object.fromEntries(db.prepare('SELECT exercise, notion_page_id FROM exercise_map WHERE notion_page_id IS NOT NULL').all().map((m) => [m.exercise, m.notion_page_id]));
  const half = sessions[Math.floor(sessions.length / 2)]?.local_date;

  const planned = planExercises(plan).map((e) => {
    const ueIds = new Set(e.uebungen.map((u) => u.id));
    const mine = sets.filter((s) => ueIds.has(map[s.exercise]));
    const done = new Set(mine.map((s) => s.activity_id));
    const reps = mine.map((s) => s.reps_ok).filter((v) => v != null);
    const early = mean(mine.filter((s) => s.local_date < half).map((s) => s.reps_ok).filter((v) => v != null));
    const late = mean(mine.filter((s) => s.local_date >= half).map((s) => s.reps_ok).filter((v) => v != null));
    return {
      ...e, tracked: !NOT_TRACKED.test(e.mode ?? ''), garmin: [...new Set(mine.map((s) => s.exercise))],
      sessions: done.size, last: mine.map((s) => s.local_date).sort().at(-1) ?? null,
      avg: mean(reps), trend: early != null && late != null ? late - early : null
    };
  });

  const plannedIds = new Set(planned.flatMap((e) => e.uebungen.map((u) => u.id)));
  const extra = {};
  for (const s of sets) {
    if (plannedIds.has(map[s.exercise])) continue;
    (extra[s.exercise] ??= { exercise: s.exercise, mapped: !!map[s.exercise], sessions: new Set() }).sessions.add(s.activity_id);
  }
  return {
    plans, sel, total: sessions.length,
    firstDate: sessions[0]?.local_date ?? null, lastDate: sessions.at(-1)?.local_date ?? null,
    tracked: planned.filter((e) => e.tracked).sort((a, b) => b.sessions - a.sessions),
    untracked: planned.filter((e) => !e.tracked),
    extra: Object.values(extra).map((x) => ({ ...x, sessions: x.sessions.size })).sort((a, b) => b.sessions - a.sessions),
    labels: exerciseLabels()
  };
}
