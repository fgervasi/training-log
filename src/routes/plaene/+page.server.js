import { getDb } from '$lib/server/db.js';
import { strengthPlans, planExercises } from '$lib/server/notion-links.js';
import { exerciseLabels, markReps } from '$lib/server/queries.js';

const NOT_TRACKED = /warm|massage|foam|stretch|mobil|cool|dehn/i;   // diese Arten erfasst die Uhr nicht als Sätze

export function load({ url }) {
  const db = getDb();
  const sessionsIn = db.prepare("SELECT id, local_date FROM activity WHERE type = 'tabata' AND local_date >= ? AND local_date <= ? ORDER BY start_time");
  const plans = strengthPlans().map((p) => ({ id: p.id, title: p.title, url: p.url, range: p.range, sessions: sessionsIn.all(p.range.start, p.range.end ?? '9999').length }));
  const sel = plans.find((p) => p.id === url.searchParams.get('id')) ?? plans.find((p) => p.sessions) ?? plans[0];
  if (!sel) return { plans, sel: null };

  const plan = strengthPlans().find((p) => p.id === sel.id);
  const sessions = sessionsIn.all(sel.range.start, sel.range.end ?? '9999');
  const ids = sessions.map((s) => s.id);
  const sets = ids.length
    ? markReps(db.prepare(`SELECT s.activity_id, s.exercise, s.reps, a.local_date FROM strength_set s JOIN activity a ON a.id = s.activity_id
        WHERE s.round > 0 AND s.activity_id IN (${ids.map(() => '?').join(',')})`).all(...ids))
    : [];
  const map = Object.fromEntries(db.prepare('SELECT exercise, notion_page_id FROM exercise_map WHERE notion_page_id IS NOT NULL').all().map((m) => [m.exercise, m.notion_page_id]));
  const half = sessions[Math.floor(sessions.length / 2)]?.local_date;
  const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

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
    tracked: planned.filter((e) => e.tracked).sort((a, b) => b.sessions - a.sessions),
    untracked: planned.filter((e) => !e.tracked),
    extra: Object.values(extra).map((x) => ({ ...x, sessions: x.sessions.size })).sort((a, b) => b.sessions - a.sessions),
    labels: exerciseLabels()
  };
}
