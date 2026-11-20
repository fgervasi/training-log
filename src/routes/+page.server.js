import { getDb } from '$lib/server/db.js';
import { weekOf } from '$lib/server/queries.js';
import { notionStatus } from '$lib/server/notion-links.js';
import { lastSync } from '$lib/server/sync.js';

export function load() {
  const db = getDb();
  const acts = db.prepare(`SELECT a.id, a.type, a.start_time, a.local_date, a.duration_s, a.distance_m, a.avg_hr, a.avg_speed, r.name AS route
    FROM activity a LEFT JOIN route r ON r.id = a.route_id ORDER BY a.start_time DESC`).all();
  const weeks = {};
  for (const a of acts) {
    const w = weekOf(a.local_date);
    weeks[w] ??= { week: w, km: 0, runs: 0, tabata: 0, minutes: 0 };
    if (a.type === 'run') { weeks[w].km += (a.distance_m || 0) / 1000; weeks[w].runs++; }
    else weeks[w].tabata++;
    weeks[w].minutes += (a.duration_s || 0) / 60;
  }
  // lückenlose Wochen bis heute
  const list = [];
  if (acts.length) {
    const first = new Date(weekOf(acts[acts.length - 1].local_date) + 'T12:00:00Z');
    const last = new Date(weekOf(new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
    for (let d = first; d <= last; d.setUTCDate(d.getUTCDate() + 7)) {
      const w = d.toISOString().slice(0, 10);
      list.push(weeks[w] ?? { week: w, km: 0, runs: 0, tabata: 0, minutes: 0 });
    }
  }
  return { recent: acts.slice(0, 12), weeks: list, total: acts.length, notion: notionStatus(), sync: lastSync() };
}
