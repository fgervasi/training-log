// Übungs-Zuordnung zusätzlich als Datei im Repo (mapping/exercises.json),
// damit sie einen Neuaufbau der Datenbank übersteht.
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.resolve('mapping/exercises.json');

/** Einträge aus der Datei übernehmen, die in der DB noch fehlen. Notion-IDs werden über den Titel gesucht. */
export function applyMappingFile(db) {
  if (!fs.existsSync(FILE)) return;
  const { mappings = [] } = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const has = db.prepare('SELECT 1 FROM exercise_map WHERE exercise = ?');
  const find = db.prepare("SELECT id FROM notion_page WHERE db = 'uebungen' AND title = ?");
  const ins = db.prepare('INSERT INTO exercise_map (exercise, notion_page_id, label, checked) VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    for (const m of mappings) {
      if (has.get(m.exercise)) continue;
      const id = m.notion ? find.get(m.notion)?.id ?? null : null;
      if (!id && !m.label) continue;            // Notion noch nicht synchronisiert: später erneut versuchen
      ins.run(m.exercise, id, m.label ?? null, m.sicher === false ? 0 : 1);
    }
  })();
}

/** Aktuellen Stand der DB in die Datei schreiben */
export function writeMappingFile(db) {
  const rows = db.prepare(`SELECT m.exercise, MAX(s.exercise_name) AS garmin, p.title AS notion, m.label, m.checked
    FROM exercise_map m LEFT JOIN notion_page p ON p.id = m.notion_page_id LEFT JOIN strength_set s ON s.exercise = m.exercise
    GROUP BY m.exercise ORDER BY m.exercise`).all();
  const prev = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
  const mappings = rows.map((r) => ({ exercise: r.exercise, garmin: r.garmin, ...(r.notion ? { notion: r.notion } : {}), ...(r.label ? { label: r.label } : {}), sicher: !!r.checked }));
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ _info: prev._info, mappings }, null, 2) + '\n');
}
