// Läufe automatisch einer Route zuordnen: Vergleich der überlaufenen Rasterzellen (~50 m).
const LAT_STEP = 0.00045, LON_STEP = 0.00067;
const MIN_SIMILARITY = 0.6;

export function cellsOf(points) {
  const set = new Set();
  for (const p of points) set.add(`${Math.round(p.lat / LAT_STEP)}:${Math.round(p.lon / LON_STEP)}`);
  return set;
}

function jaccard(a, b) {
  let inter = 0;
  for (const c of a) if (b.has(c)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Findet die passende Route oder legt eine neue an. Gibt die route_id zurück. */
export function assignRoute(db, points, distance_m) {
  const cells = cellsOf(points);
  let best = null;
  for (const r of db.prepare('SELECT id, cells FROM route').all()) {
    const sim = jaccard(cells, new Set(JSON.parse(r.cells)));
    if (sim >= MIN_SIMILARITY && (!best || sim > best.sim)) best = { id: r.id, sim };
  }
  if (best) return best.id;
  const n = db.prepare('SELECT COUNT(*) AS n FROM route').get().n + 1;
  const km = distance_m ? (distance_m / 1000).toFixed(1).replace('.', ',') : '?';
  const info = db.prepare('INSERT INTO route (name, cells) VALUES (?, ?)').run(`Route ${n} (${km} km)`, JSON.stringify([...cells]));
  return Number(info.lastInsertRowid);
}
