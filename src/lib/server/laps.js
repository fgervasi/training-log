// Runden (Laps) und Intervalle eines Laufs
import { getDb } from './db.js';

export const PHASE = { warmup: 'Aufwärmen', active: 'Belastung', interval: 'Belastung', recovery: 'Erholung', rest: 'Pause', cooldown: 'Auslaufen' };
const isWork = (l) => l.intensity === 'active' || l.intensity === 'interval';

/** Runden eines Laufs; Belastungsrunden fortlaufend nummeriert (n) */
export function lapsOf(activityId) {
  let n = 0;
  return getDb().prepare('SELECT * FROM lap WHERE activity_id = ? ORDER BY idx').all(activityId)
    .map((l) => ({ ...l, work: isWork(l), n: isWork(l) ? ++n : null, phase: PHASE[l.intensity] ?? l.intensity ?? 'Runde' }));
}

/** Zeit im Zielpuls-Bereich (aus den Runden mit Pulsvorgabe) */
export function zoneTime(activityId, laps = lapsOf(activityId)) {
  const target = laps.filter((l) => l.target_hr_low && l.target_hr_high);
  if (!target.length) return null;
  const pts = getDb().prepare('SELECT t, hr FROM run_point WHERE activity_id = ? AND hr IS NOT NULL ORDER BY t').all(activityId);
  const r = { low: target[0].target_hr_low, high: target[0].target_hr_high, below: 0, inside: 0, above: 0 };
  for (const l of target) {
    const inLap = pts.filter((p) => p.t >= l.start_t && p.t < l.start_t + l.duration_s);
    for (let i = 1; i < inLap.length; i++) {
      const dt = Math.min(10, inLap[i].t - inLap[i - 1].t), hr = inLap[i].hr;
      r[hr < l.target_hr_low ? 'below' : hr > l.target_hr_high ? 'above' : 'inside'] += dt;
    }
  }
  const tot = r.below + r.inside + r.above;
  return { ...r, share: tot ? r.inside / tot : null, total: tot };
}

/** Belastungsintervalle aller Läufe einer Route (für den Verlauf je Intervall) */
export function intervalHistory(routeId) {
  const rows = getDb().prepare(`SELECT a.id, a.start_time, a.workout, l.idx, l.intensity, l.avg_hr, l.max_hr, l.avg_speed, l.duration_s, l.distance_m
    FROM activity a JOIN lap l ON l.activity_id = a.id WHERE a.type = 'run' AND a.route_id = ? ORDER BY a.start_time, l.idx`).all(routeId);
  const out = [];
  let cur = null, n = 0;
  for (const r of rows) {
    if (!cur || cur !== r.id) { cur = r.id; n = 0; }
    if (r.intensity === 'active' || r.intensity === 'interval') out.push({ ...r, n: ++n });
  }
  // nur Läufe mit mehreren Intervallen (Intervalltraining), nicht Dauerläufe mit einer Belastungsrunde
  const per = {};
  for (const r of out) per[r.id] = Math.max(per[r.id] ?? 0, r.n);
  return out.filter((r) => per[r.id] >= 3);
}

/** Zeit im Zielbereich für alle Läufe einer Route */
export function zoneHistory(routeId) {
  return getDb().prepare("SELECT id, start_time FROM activity WHERE type = 'run' AND route_id = ? ORDER BY start_time").all(routeId)
    .map((a) => ({ ...a, zone: zoneTime(a.id) })).filter((a) => a.zone && a.zone.total > 300);
}
