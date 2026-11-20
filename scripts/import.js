// Aufruf: npm run import -- <ZIP | Ordner | .fit> [...]
// Beispiel: npm run import -- ~/Downloads/<garmin-export>/DI_CONNECT/DI-Connect-Uploaded-Files
import { importInputs } from '../src/lib/server/importer.js';

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('Bitte Pfad angeben: npm run import -- <ZIP | Ordner | .fit>');
  process.exit(1);
}
const t = Date.now();
const s = importInputs(inputs, console.warn);
console.log(`${s.seen} Dateien gelesen: ${s.runs} Läufe und ${s.tabata} Tabata-Einheiten neu importiert, ` +
  `${s.skipped} schon vorhanden, ${s.ignored} andere Aktivitäten/Gesundheitsdaten übersprungen, ${s.errors} Fehler (${((Date.now() - t) / 1000).toFixed(0)} s).`);
