// SQLite-Datenbank: eine Datei unter data/training.db (nicht im Repo).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.TRAINING_DATA_DIR || 'data');
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
  cells  TEXT NOT NULL                     -- JSON: Rasterzellen der Referenzstrecke
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

-- Zuordnung Garmin-Übung -> Notion-Übung (einmal pflegen, dann automatisch)
CREATE TABLE IF NOT EXISTS exercise_map (
  exercise       TEXT PRIMARY KEY,         -- 'kategorie:nummer'
  notion_page_id TEXT REFERENCES notion_page(id),
  label          TEXT                      -- eigener Name, falls gewünscht
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
  return db;
}
