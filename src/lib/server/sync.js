// Synchronisation Garmin (Personal API) + Notion, nutzbar aus Skript und App.
import fs from 'node:fs';
import path from 'node:path';
import { GarminClient, isRelevantType } from './garmin-api.js';
import { getDb, getMeta, setMeta } from './db.js';
import { DATA_DIR } from './paths.js';
import { importInputs } from './importer.js';
import { syncNotion } from './notion.js';

const STATE_FILE = path.join(DATA_DIR, 'garmin-sync.json');
const ZIP_DIR = path.join(DATA_DIR, 'raw', 'garmin-api');

export async function syncGarmin(env, { since = null, dryRun = false, log = () => {} } = {}) {
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { downloaded: [] };
  const done = new Set(state.downloaded.map(String));
  const last = getDb().prepare('SELECT MAX(local_date) AS d FROM activity').get().d;
  const from = since ?? last ?? null;

  const garmin = new GarminClient(env.GARMIN_API_KEY ?? env.GARMIN_PERSONAL_API_KEY);
  const list = await garmin.activitiesSince(from);
  const todo = list
    .map((a) => ({ id: String(a.activityId ?? a.id), type: a.activityType?.typeKey ?? a.activityType ?? '', name: a.activityName ?? '', start: a.startTimeLocal ?? a.startTimeGMT ?? '' }))
    .filter((a) => isRelevantType(a.type) && !done.has(a.id));
  log(`${list.length} Aktivitäten seit ${from ?? 'Beginn'} gefunden, ${todo.length} neu und relevant.`);
  for (const a of todo) log(`  ${a.start}  ${a.type.padEnd(18)} ${a.name}`);
  if (dryRun || !todo.length) return { found: list.length, new: todo.length, runs: 0, tabata: 0 };

  fs.mkdirSync(ZIP_DIR, { recursive: true });
  const files = [];
  for (const a of todo) {
    const file = path.join(ZIP_DIR, `${a.id}.zip`);
    fs.writeFileSync(file, await garmin.download(a.id));
    files.push(file);
    state.downloaded.push(a.id);
    await new Promise((r) => setTimeout(r, 300));   // Garmin nicht überlasten
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  const s = importInputs(files, log);
  return { found: list.length, new: todo.length, runs: s.runs, tabata: s.tabata };
}

const errText = (e) => (e.message === 'fetch failed' || e.cause?.code === 'ENOTFOUND' ? 'Server nicht erreichbar (Internetverbindung?)' : e.message);

let running = null;
/** Beides synchronisieren; Ergebnis wird als 'last_sync' gespeichert. Läuft nie doppelt. */
export function runSync(env) {
  if (running) return running;
  running = (async () => {
    const result = { at: new Date().toISOString(), garmin: null, notion: null, errors: [] };
    try { result.garmin = await syncGarmin(env); } catch (e) { result.errors.push(`Garmin: ${errText(e)}`); }
    if (env.NOTION_API_KEY) {
      try { result.notion = await syncNotion(env, () => {}); } catch (e) { result.errors.push(`Notion: ${errText(e.body ? { message: e.body } : e)}`); }
    }
    setMeta('last_sync', JSON.stringify(result));
    return result;
  })().finally(() => { running = null; });
  return running;
}

export const lastSync = () => { const v = getMeta('last_sync'); return v ? JSON.parse(v) : null; };
