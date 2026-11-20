// Notion: die drei Datenbanken generisch laden. Die Feldnamen werden nicht fest
// erwartet, sondern aus dem Schema gelesen; Relationen werden über die Seiten-IDs aufgelöst.
import { Client } from '@notionhq/client';
import { getDb } from './db.js';

export const NOTION_DBS = {
  plan: { env: 'NOTION_DB_PLAN', label: 'Trainingsplan' },
  variation: { env: 'NOTION_DB_VARIATION', label: 'Übungsvariation' },
  uebungen: { env: 'NOTION_DB_UEBUNGEN', label: 'Übungen' }
};

const plain = (arr) => (arr || []).map((x) => x.plain_text).join('');

/** Notion-Eigenschaft -> einfacher JS-Wert */
export function simplify(p) {
  switch (p.type) {
    case 'title': case 'rich_text': return plain(p[p.type]);
    case 'number': return p.number;
    case 'checkbox': return p.checkbox;
    case 'select': case 'status': return p[p.type]?.name ?? null;
    case 'multi_select': return p.multi_select.map((o) => o.name);
    case 'date': return p.date ? (p.date.end ? { start: p.date.start, end: p.date.end } : p.date.start) : null;
    case 'relation': return p.relation.map((r) => r.id);
    case 'url': case 'email': case 'phone_number': return p[p.type];
    case 'formula': { const f = p.formula; return f[f.type] ?? null; }
    case 'rollup': {
      const r = p.rollup;
      if (r.type === 'array') return r.array.map((x) => simplify(x));
      return r[r.type] ?? null;
    }
    case 'people': return p.people.map((u) => u.name || u.id);
    case 'files': return p.files.map((f) => f.name);
    case 'created_time': case 'last_edited_time': return p[p.type];
    case 'unique_id': return p.unique_id ? `${p.unique_id.prefix ?? ''}${p.unique_id.number}` : null;
    default: return null;
  }
}

const dateOnly = (v) => (typeof v === 'string' ? v.slice(0, 10) : v?.start?.slice(0, 10) ?? null);

export async function syncNotion(env = process.env, log = console.log) {
  if (!env.NOTION_API_KEY) throw new Error('NOTION_API_KEY fehlt in .env');
  const notion = new Client({ auth: env.NOTION_API_KEY });
  const db = getDb();
  const now = new Date().toISOString();
  const upsertSchema = db.prepare('INSERT INTO notion_schema (db, title, props) VALUES (?, ?, ?) ON CONFLICT(db) DO UPDATE SET title = excluded.title, props = excluded.props');
  const upsertPage = db.prepare(`INSERT INTO notion_page (id, db, title, date, props, url, synced_at) VALUES (@id, @db, @title, @date, @props, @url, @synced_at)
    ON CONFLICT(id) DO UPDATE SET db = excluded.db, title = excluded.title, date = excluded.date, props = excluded.props, url = excluded.url, synced_at = excluded.synced_at`);
  const summary = {};

  for (const [key, cfg] of Object.entries(NOTION_DBS)) {
    const id = env[cfg.env];
    if (!id) { log(`${cfg.label}: ${cfg.env} fehlt in .env, übersprungen`); continue; }
    const meta = await notion.databases.retrieve({ database_id: id });
    const types = Object.fromEntries(Object.entries(meta.properties).map(([n, p]) => [n, p.type]));
    const titleProp = Object.keys(types).find((n) => types[n] === 'title');
    const dateProp = Object.keys(types).find((n) => types[n] === 'date');
    upsertSchema.run(key, plain(meta.title), JSON.stringify(types));

    const pages = [];
    let cursor;
    do {
      const res = await notion.databases.query({ database_id: id, start_cursor: cursor, page_size: 100 });
      pages.push(...res.results);
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);

    db.transaction(() => {
      db.prepare('DELETE FROM notion_page WHERE db = ? AND synced_at < ?').run(key, now);
      for (const pg of pages) {
        const props = Object.fromEntries(Object.entries(pg.properties).map(([n, p]) => [n, simplify(p)]));
        upsertPage.run({ id: pg.id, db: key, title: titleProp ? props[titleProp] : null, date: dateProp ? dateOnly(props[dateProp]) : null,
          props: JSON.stringify(props), url: pg.url, synced_at: now });
      }
    })();
    summary[key] = pages.length;
    log(`\n${cfg.label} („${plain(meta.title)}“): ${pages.length} Seiten`);
    for (const [n, t] of Object.entries(types)) log(`  - ${n}: ${t}${n === titleProp ? ' (Titel)' : ''}${n === dateProp ? ' (Datum für Verknüpfung)' : ''}`);
  }
  return summary;
}
