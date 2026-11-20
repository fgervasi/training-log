// Abschnitte einer Route: Zeit für ein bestimmtes Stück (z. B. einen Anstieg) über alle Läufe.
import { getDb } from './db.js';

const TOL_M = 30;   // so nah muss ein Lauf an Start- und Endpunkt vorbeikommen

function dist(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const fullPoints = (id) => getDb().prepare('SELECT t, lat, lon, alt_m, hr, dist_m FROM run_point WHERE activity_id = ? ORDER BY t').all(id);

/** Nächste Punkte zu `target`, je Vorbeigang einer (Index mit kleinstem Abstand) */
function passes(points, target, from = 0) {
  const out = [];
  let best = null;
  for (let i = from; i < points.length; i++) {
    const d = dist(points[i], target);
    if (d <= TOL_M) { if (!best || d < best.d) best = { i, d }; }
    else if (best) { out.push(best.i); best = null; }
  }
  if (best) out.push(best.i);
  return out;
}

/** Zeit auf dem Abschnitt oder null, wenn der Lauf ihn nicht (in der richtigen Richtung) enthält */
export function timeOnSegment(points, seg) {
  const start = { lat: seg.start_lat, lon: seg.start_lon }, end = { lat: seg.end_lat, lon: seg.end_lon };
  const expected = Math.max(50, ((seg.end_km ?? 0) - (seg.start_km ?? 0)) * 1000);
  for (const s of passes(points, start)) {
    for (const e of passes(points, end, s + 1)) {
      const len = points[e].dist_m - points[s].dist_m;
      if (len < expected * 0.6) continue;
      if (len > expected * 1.8) break;
      const part = points.slice(s, e + 1);
      const hrs = part.map((p) => p.hr).filter((v) => v != null);
      let ascent = 0;
      for (let k = 1; k < part.length; k++) { const d = (part[k].alt_m ?? 0) - (part[k - 1].alt_m ?? 0); if (d > 0) ascent += d; }
      return { s: points[e].t - points[s].t, len, ascent, avg_hr: hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null, max_hr: hrs.length ? Math.max(...hrs) : null };
    }
  }
  return null;
}

export const segmentsOf = (routeId) => getDb().prepare('SELECT * FROM segment WHERE route_id = ? ORDER BY start_km').all(routeId);

/** Ergebnisse aller Läufe der Route für alle Abschnitte */
export function segmentResults(routeId) {
  const segs = segmentsOf(routeId);
  if (!segs.length) return [];
  const runs = getDb().prepare("SELECT id, start_time FROM activity WHERE type = 'run' AND route_id = ? ORDER BY start_time").all(routeId);
  const res = segs.map((seg) => ({ ...seg, results: [] }));
  for (const r of runs) {
    const pts = fullPoints(r.id);
    res.forEach((seg) => { const x = timeOnSegment(pts, seg); if (x) seg.results.push({ id: r.id, start_time: r.start_time, ...x }); });
  }
  return res;
}

/** Abschnitte mit Zeit für einen einzelnen Lauf */
export function segmentTimesFor(runId, routeId) {
  const pts = fullPoints(runId);
  return segmentsOf(routeId).map((seg) => ({ ...seg, result: timeOnSegment(pts, seg) }));
}

export function createSegment(runId, name, fromKm, toKm) {
  const run = getDb().prepare("SELECT route_id FROM activity WHERE id = ? AND type = 'run'").get(runId);
  if (!run?.route_id) throw new Error('Lauf ohne Route');
  const pts = fullPoints(runId);
  const at = (km) => pts.reduce((b, p) => (Math.abs(p.dist_m - km * 1000) < Math.abs(b.dist_m - km * 1000) ? p : b));
  const a = at(fromKm), b = at(toKm);
  return getDb().prepare('INSERT INTO segment (route_id, name, start_km, end_km, start_lat, start_lon, end_lat, end_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(run.route_id, name, a.dist_m / 1000, b.dist_m / 1000, a.lat, a.lon, b.lat, b.lon).lastInsertRowid;
}

export const deleteSegment = (id) => getDb().prepare('DELETE FROM segment WHERE id = ?').run(id);
