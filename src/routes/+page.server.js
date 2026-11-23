import { getDb } from '$lib/server/db.js';
import { weekOf } from '$lib/server/queries.js';
import { notionStatus } from '$lib/server/notion-links.js';
import { lastSync } from '$lib/server/sync.js';
import { autoNameRoutes } from '$lib/server/route-names.js';

const iso = (d) => d.toISOString().slice(0, 10);

export function load({ url }) {
  const db = getDb();
  autoNameRoutes();

  // Kennzahlen: aktuelle Woche und Schnitt der 4 Wochen davor
  const today = new Date().toISOString().slice(0, 10);
  const thisWeek = weekOf(today);
  const startPrev = new Date(thisWeek + 'T12:00:00Z'); startPrev.setUTCDate(startPrev.getUTCDate() - 28);
  const kpiRows = db.prepare('SELECT type, local_date, distance_m FROM activity WHERE local_date >= ?').all(iso(startPrev));
  const sum = (from, to) => {
    const r = kpiRows.filter((a) => a.local_date >= from && a.local_date < to);
    return { km: r.filter((a) => a.type === 'run').reduce((s, a) => s + (a.distance_m || 0) / 1000, 0), runs: r.filter((a) => a.type === 'run').length, tabata: r.filter((a) => a.type === 'tabata').length };
  };
  const cur = sum(thisWeek, '9999');
  const prev = sum(iso(startPrev), thisWeek);
  const kpis = { cur, avg4: { km: prev.km / 4, runs: prev.runs / 4, tabata: prev.tabata / 4 } };

  // Monatskalender: ganze Wochen (Mo–So), die den Monat abdecken
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get('monat') || '') ? url.searchParams.get('monat') : today.slice(0, 7);
  const first = new Date(month + '-01T12:00:00Z');
  const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  const gridStart = new Date(weekOf(iso(first)) + 'T12:00:00Z');
  const gridEnd = new Date(weekOf(iso(last)) + 'T12:00:00Z'); gridEnd.setUTCDate(gridEnd.getUTCDate() + 6);
  const acts = db.prepare(`SELECT a.id, a.type, a.start_time, a.local_date, a.duration_s, a.distance_m, a.avg_hr, a.workout, r.name AS route
    FROM activity a LEFT JOIN route r ON r.id = a.route_id WHERE a.local_date BETWEEN ? AND ? ORDER BY a.start_time`).all(iso(gridStart), iso(gridEnd));

  const weeks = [];
  for (let d = new Date(gridStart); d <= gridEnd;) {
    const days = [];
    for (let i = 0; i < 7; i++, d.setUTCDate(d.getUTCDate() + 1)) {
      const date = iso(d);
      days.push({ date, inMonth: date.slice(0, 7) === month, today: date === today, acts: acts.filter((a) => a.local_date === date) });
    }
    const wa = days.flatMap((x) => x.acts);
    weeks.push({ days, km: wa.filter((a) => a.type === 'run').reduce((s, a) => s + (a.distance_m || 0) / 1000, 0), runs: wa.filter((a) => a.type === 'run').length, tabata: wa.filter((a) => a.type === 'tabata').length });
  }
  const shift = (n) => { const x = new Date(first); x.setUTCMonth(x.getUTCMonth() + n); return iso(x).slice(0, 7); };
  const range = db.prepare('SELECT MIN(local_date) a, MAX(local_date) b FROM activity').get();

  return {
    kpis, total: db.prepare('SELECT COUNT(*) n FROM activity').get().n,
    month, prevMonth: shift(-1), nextMonth: shift(1), isCurrent: month === today.slice(0, 7),
    hasPrev: range.a ? range.a.slice(0, 7) < month : false,
    weeks, notion: notionStatus(), sync: lastSync()
  };
}
