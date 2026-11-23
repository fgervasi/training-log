// Import von FIT-Dateien aus einer ZIP-Datei, einem Ordner oder einzelnen Dateien.
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { getDb } from './db.js';
import { RAW_DIR } from './paths.js';
import { parseFit } from './fit.js';
import { assignRoute } from './routes-detect.js';
import { localDate } from './time.js';
import { insertLaps } from './reprocess.js';


/** Dateiname ohne E-Mail-Präfix aus dem Garmin-Export ("name@domain.ch_123.fit" -> "123.fit") */
const cleanName = (name) => path.basename(name).replace(/^[^_]*@[^_]*_/, '');

function* collect(input) {
  const stat = fs.statSync(input);
  if (stat.isDirectory()) {
    for (const f of fs.readdirSync(input)) yield* collect(path.join(input, f));
  } else if (/\.zip$/i.test(input)) {
    for (const e of new AdmZip(input).getEntries()) {
      if (!e.isDirectory && /\.fit$/i.test(e.entryName)) yield { name: cleanName(e.entryName), read: () => e.getData() };
    }
  } else if (/\.fit$/i.test(input)) {
    yield { name: cleanName(input), read: () => fs.readFileSync(input) };
  }
}

export function importInputs(inputs, log = () => {}) {
  const db = getDb();
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const known = new Set(db.prepare('SELECT source_file FROM activity').all().map((r) => r.source_file));
  // dieselbe Aktivität kann aus Export und API mit verschiedenen Dateinamen kommen: zusätzlich über die Startzeit erkennen
  const knownStarts = new Set(db.prepare('SELECT type, start_time FROM activity').all().map((r) => `${r.type}|${r.start_time}`));
  const parsed = [];
  const stats = { seen: 0, skipped: 0, ignored: 0, runs: 0, tabata: 0, errors: 0 };

  for (const input of inputs) {
    for (const f of collect(input)) {
      stats.seen++;
      if (known.has(f.name)) { stats.skipped++; continue; }
      let buf, res;
      try { buf = f.read(); res = parseFit(buf); } catch (e) { stats.errors++; log(`Fehler in ${f.name}: ${e.message}`); continue; }
      if (!res) { stats.ignored++; continue; }
      const startKey = `${res.type}|${res.session.start_time.toISOString()}`;
      if (knownStarts.has(startKey)) { stats.skipped++; known.add(f.name); continue; }
      knownStarts.add(startKey);
      parsed.push({ name: f.name, buf, ...res });
      known.add(f.name);
    }
  }

  // chronologisch, damit Routen in sinnvoller Reihenfolge entstehen
  parsed.sort((a, b) => a.session.start_time - b.session.start_time);

  const insAct = db.prepare(`INSERT INTO activity (source_file, type, start_time, local_date, duration_s, distance_m, avg_hr, max_hr, ascent_m, avg_speed, training_effect, route_id, workout)
    VALUES (@source_file, @type, @start_time, @local_date, @duration_s, @distance_m, @avg_hr, @max_hr, @ascent_m, @avg_speed, @training_effect, @route_id, @workout)`);
  const insPt = db.prepare('INSERT INTO run_point (activity_id, t, lat, lon, alt_m, hr, speed, dist_m) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insSet = db.prepare(`INSERT INTO strength_set (activity_id, idx, round, pos, start_time, duration_s, exercise, category, exercise_name, reps, avg_hr, max_hr)
    VALUES (@activity_id, @idx, @round, @pos, @start_time, @duration_s, @exercise, @category, @exercise_name, @reps, @avg_hr, @max_hr)`);

  const tx = db.transaction((items) => {
    for (const it of items) {
      const s = it.session;
      const route_id = it.type === 'run' ? assignRoute(db, it.points, s.distance_m) : null;
      const id = Number(insAct.run({ ...s, start_time: s.start_time.toISOString(), local_date: localDate(s.start_time), source_file: it.name, type: it.type, route_id }).lastInsertRowid);
      if (it.type === 'run') { for (const p of it.points) insPt.run(id, p.t, p.lat, p.lon, p.alt_m, p.hr, p.speed, p.dist_m); insertLaps(db, id, it.laps); }
      else for (const st of it.sets) insSet.run({ ...st, activity_id: id });
      fs.writeFileSync(path.join(RAW_DIR, it.name), it.buf);
      stats[it.type === 'run' ? 'runs' : 'tabata']++;
    }
  });
  tx(parsed);
  return stats;
}
