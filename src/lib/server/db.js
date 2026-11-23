// SQLite-Datenbank: eine Datei unter data/training.db (nicht im Repo).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { applyMappingFile } from './mapping.js';
import { DATA_DIR } from './paths.js';
import { reprocessSets, SETS_VERSION } from './reprocess.js';

export { DATA_DIR };
const DB_FILE = path.join(DATA_DIR, 'training.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS activity (
  id            INTEGER PRIMARY KEY,
  source_file   TEXT UNIQUE NOT NULL,      -- Dateiname der FIT-Datei in data/raw
  type          TEXT NOT NULL,             -- 'run' | 'tabata'
  start_time    TEXT NOT NULL,             -- ISO, UTC
  local_date    TEXT NOT NULL,             -- YYYY-MM-DD, Europe/Zurich
  duration_s    REAL,
  distance_m    REAL,
  avg_hr        REAL,
  max_hr        REAL,
  ascent_m      REAL,
  avg_speed     REAL,                      -- m/s
  training_effect REAL,
  route_id      INTEGER REFERENCES route(id)
);
CREATE INDEX IF NOT EXISTS activity_type_date ON activity(type, start_time);

CREATE TABLE IF NOT EXISTS route (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  cells  TEXT NOT NULL,                    -- JSON: Rasterzellen der Referenzstrecke
  auto_name INTEGER NOT NULL DEFAULT 1     -- 1 = Name folgt dem Notion-Plan, 0 = von Hand umbenannt
);

CREATE TABLE IF NOT EXISTS run_point (
  activity_id INTEGER NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  t      REAL NOT NULL,                    -- Sekunden seit Start
  lat    REAL, lon REAL,
  alt_m  REAL, hr INTEGER, speed REAL, dist_m REAL
);
CREATE INDEX IF NOT EXISTS run_point_act ON run_point(activity_id);

CREATE TABLE IF NOT EXISTS strength_set (
  activity_id INTEGER NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  idx         INTEGER NOT NULL,            -- Reihenfolge der aktiven Sätze
  round       INTEGER,                     -- Runde im Zirkel (0 = Aufwärmen)
  pos         INTEGER,                     -- Position in der Runde
  start_time  TEXT,
  duration_s  REAL,
  exercise    TEXT,                        -- 'kategorie:nummer', z. B. 'plank:34'
  category    TEXT,
  exercise_name TEXT,                      -- Garmin-Name, z. B. 'mountainClimber'
  reps        INTEGER,                     -- NULL, wenn die Uhr nicht gezählt hat
  avg_hr      REAL,
  max_hr      REAL,
  PRIMARY KEY (activity_id, idx)
);

-- Notion: alle Seiten der drei Datenbanken, Eigenschaften vereinfacht als JSON
CREATE TABLE IF NOT EXISTS notion_page (
  id      TEXT PRIMARY KEY,
  db      TEXT NOT NULL,                   -- 'plan' | 'variation' | 'uebungen'
  title   TEXT,
  date    TEXT,                            -- erstes Datumsfeld (YYYY-MM-DD), falls vorhanden
  props   TEXT NOT NULL,                   -- JSON {Feldname: Wert}
  url     TEXT,
  synced_at TEXT
);
CREATE TABLE IF NOT EXISTS notion_schema (
  db     TEXT PRIMARY KEY,
  title  TEXT,
  props  TEXT NOT NULL                     -- JSON {Feldname: Typ}
);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

-- Runden eines Laufs (Garmin-Laps), z. B. die Intervalle des Norwegischen Protokolls
CREATE TABLE IF NOT EXISTS lap (
  activity_id INTEGER NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  idx         INTEGER NOT NULL,
  intensity   TEXT,                        -- warmup | active | recovery | cooldown | rest
  step_index  INTEGER,
  start_t     REAL, duration_s REAL, distance_m REAL, start_dist REAL,
  avg_hr      REAL, max_hr REAL, avg_speed REAL, ascent_m REAL,
  target_hr_low INTEGER, target_hr_high INTEGER,
  PRIMARY KEY (activity_id, idx)
);

-- Abschnitte einer Route (z. B. ein Anstieg), deren Zeit über alle Läufe verglichen wird
CREATE TABLE IF NOT EXISTS segment (
  id        INTEGER PRIMARY KEY,
  route_id  INTEGER NOT NULL REFERENCES route(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  start_km  REAL, end_km REAL,
  start_lat REAL NOT NULL, start_lon REAL NOT NULL,
  end_lat   REAL NOT NULL, end_lon REAL NOT NULL
);

-- Zuordnung Garmin-Übung -> Notion-Übung (einmal pflegen, dann automatisch)
CREATE TABLE IF NOT EXISTS exercise_map (
  exercise       TEXT PRIMARY KEY,         -- 'kategorie:nummer'
  notion_page_id TEXT REFERENCES notion_page(id),
  label          TEXT,                     -- eigener Name, falls gewünscht
  checked        INTEGER NOT NULL DEFAULT 1 -- 0 = Vorschlag, noch nicht bestätigt
);
`;

let db;
export function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // Migration: Vorschläge (checked = 0) von bestätigten Zuordnungen unterscheiden
  if (!db.prepare('PRAGMA table_info(exercise_map)').all().some((c) => c.name === 'checked')) {
    db.exec('ALTER TABLE exercise_map ADD COLUMN checked INTEGER NOT NULL DEFAULT 1');
  }
  if (!db.prepare('PRAGMA table_info(route)').all().some((c) => c.name === 'auto_name')) {
    db.exec('ALTER TABLE route ADD COLUMN auto_name INTEGER NOT NULL DEFAULT 1');
    db.exec("UPDATE route SET auto_name = 0 WHERE name NOT GLOB 'Route [0-9]*'");   // eigene Namen behalten
  }
  if (!db.prepare('PRAGMA table_info(activity)').all().some((c) => c.name === 'workout')) {
    db.exec('ALTER TABLE activity ADD COLUMN workout TEXT');   // Name des Garmin-Workouts
  }
  applyMappingFile(db);
  // Tabata-Sätze neu berechnen, wenn sich die Rundenerkennung geändert hat
  if (Number(getMeta('sets_version') ?? 1) < SETS_VERSION) {
    reprocessSets(db);
    setMeta('sets_version', String(SETS_VERSION));
  }
  return db;
}

export function getMeta(key) {
  return getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}

export function setMeta(key, value) {
  getDb().prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
