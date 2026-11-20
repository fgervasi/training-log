// Aufruf: pnpm run sync:garmin [-- --since 2026-11-01] [-- --dry-run]
// Holt neue Aktivitäten über die Garmin Personal API und importiert sie.
import { syncGarmin } from '../src/lib/server/sync.js';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

try {
  const s = await syncGarmin(process.env, { since: opt('since'), dryRun: args.includes('--dry-run'), log: console.log });
  if (s.runs || s.tabata) console.log(`Importiert: ${s.runs} Läufe, ${s.tabata} Tabata-Einheiten.`);
} catch (e) {
  const offline = e.message === 'fetch failed' || e.cause?.code === 'ENOTFOUND';
  console.error('Garmin-Sync fehlgeschlagen:', offline ? 'Garmin-Server nicht erreichbar (Internetverbindung?)' : e.message);
  process.exit(1);
}
