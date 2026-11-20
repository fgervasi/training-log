// Notion-Seiten lesen und Relationen auflösen.
import { getDb } from './db.js';

function rowToPage(r) {
  return r && { ...r, props: JSON.parse(r.props) };
}

export function getPage(id) {
  return rowToPage(getDb().prepare('SELECT * FROM notion_page WHERE id = ?').get(id));
}

export function pagesOf(dbKey) {
  return getDb().prepare('SELECT * FROM notion_page WHERE db = ? ORDER BY title').all(dbKey).map(rowToPage);
}

export function schemaOf(dbKey) {
  const r = getDb().prepare('SELECT * FROM notion_schema WHERE db = ?').get(dbKey);
  return r ? { title: r.title, props: JSON.parse(r.props) } : null;
}

/** Ersetzt Relations-IDs durch {id, title, db}; depth 2 löst auch Relationen der verknüpften Seiten auf. */
export function resolve(page, depth = 2) {
  if (!page) return null;
  const schema = schemaOf(page.db)?.props || {};
  const fields = [];
  for (const [name, value] of Object.entries(page.props)) {
    const type = schema[name];
    if (type === 'title') continue;
    if (type === 'relation' && Array.isArray(value)) {
      const linked = value.map((id) => getPage(id)).filter(Boolean);
      fields.push({ name, type, linked: linked.map((p) => ({ id: p.id, title: p.title, db: p.db, url: p.url, children: depth > 1 ? resolve(p, depth - 1).fields : [] })) });
    } else if (value != null && value !== '' && !(Array.isArray(value) && !value.length)) {
      fields.push({ name, type, value });
    }
  }
  return { ...page, fields };
}

/** Trainingsplan-Einträge an einem Datum (YYYY-MM-DD) */
export function plansOn(date) {
  return getDb().prepare("SELECT * FROM notion_page WHERE db = 'plan' AND date = ?").all(date).map((r) => resolve(rowToPage(r)));
}

export function notionStatus() {
  const db = getDb();
  return Object.fromEntries(db.prepare('SELECT db, COUNT(*) n, MAX(synced_at) at FROM notion_page GROUP BY db').all().map((r) => [r.db, r]));
}
