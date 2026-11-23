// Routen nach dem passenden Notion-Laufplan benennen (über das Garmin-Workout der Läufe),
// solange der Name nicht von Hand vergeben wurde (route.auto_name = 1).
import { getDb } from './db.js';
import { runningPlans, stems } from './notion-links.js';

export function autoNameRoutes() {
  const db = getDb();
  const plans = runningPlans();
  const routes = db.prepare('SELECT id, name FROM route WHERE auto_name = 1').all();
  const workouts = db.prepare("SELECT workout, COUNT(*) n, AVG(distance_m) dist FROM activity WHERE type = 'run' AND route_id = ? AND workout IS NOT NULL GROUP BY workout ORDER BY n DESC");
  const proposals = routes.map((r) => {
    const w = workouts.all(r.id)[0];
    const total = db.prepare("SELECT COUNT(*) n FROM activity WHERE type = 'run' AND route_id = ?").get(r.id).n;
    if (!w) return { ...r, next: r.name, total };
    const ws = stems(w.workout);
    const plan = plans.find((p) => [...stems(p.title)].some((s) => ws.has(s)));
    return { ...r, next: plan?.title ?? w.workout, dist: w.dist, total };
  });
  // gleicher Name für mehrere Routen: die meistgelaufene bekommt ihn ohne Zusatz, die anderen mit Distanz
  const main = {};
  for (const p of proposals) if (!main[p.next] || p.total > main[p.next].total) main[p.next] = p;
  const upd = db.prepare('UPDATE route SET name = ? WHERE id = ?');
  for (const p of proposals) {
    const name = main[p.next] !== p && p.dist ? `${p.next} (${(p.dist / 1000).toFixed(1).replace('.', ',')} km)` : p.next;
    if (name !== p.name) upd.run(name, p.id);
  }
}
