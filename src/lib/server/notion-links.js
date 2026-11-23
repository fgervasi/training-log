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

// ---- Trainingspläne als Zeiträume -------------------------------------------

const dateOnly = (v) => (typeof v === 'string' ? v.slice(0, 10) : v?.start?.slice(0, 10) ?? null);

/** Start/Ende eines Plans aus seinen Datumsfeldern (Start_Date / End_Date o. ä.) */
export function dateRange(page) {
  const schema = schemaOf(page.db)?.props || {};
  const dates = Object.keys(schema).filter((n) => schema[n] === 'date');
  const s = dates.find((n) => /start|beginn|von/i.test(n)) ?? dates[0];
  const e = dates.find((n) => /end|ende|bis/i.test(n) && n !== s);
  const start = s ? dateOnly(page.props[s]) : null;
  return { start, end: e ? dateOnly(page.props[e]) : start };
}

export const KIND = { strength: /tabata|strength|kraft/i, run: /run|lauf/i };

/** Pläne, die an `date` gelten und zur Art passen; der mit den meisten verknüpften Übungen zuerst */
export function plansFor(date, kind = 'strength') {
  const schema = schemaOf('plan')?.props || {};
  const typeProp = Object.keys(schema).find((n) => /^typ(e)?$/i.test(n) && (schema[n] === 'select' || schema[n] === 'status'));
  const relCount = (p) => Object.keys(schema).filter((n) => schema[n] === 'relation').reduce((s, n) => s + (p.props[n]?.length || 0), 0);
  return pagesOf('plan')
    .map((p) => ({ ...p, range: dateRange(p), title: (p.title || '').split('\n').filter(Boolean).at(-1)?.replace(/^#\s*/, '') ?? p.title }))
    .filter((p) => p.range.start && p.range.start <= date && (!p.range.end || date <= p.range.end))
    .filter((p) => !typeProp || KIND[kind].test(p.props[typeProp] || ''))
    .sort((a, b) => relCount(b) - relCount(a) || b.range.start.localeCompare(a.range.start));
}

export const planFor = (date, kind) => plansFor(date, kind)[0] ?? null;

/**
 * Plan zu einer Aktivität: Trägt das Garmin-Workout eine Nummer ("Tabata #15", "Tabata 13"),
 * gilt der Kraftplan mit dieser Nummer ("Kraftraining #15"), sonst der am Datum gültige Plan.
 */
export function planForActivity(date, workout, kind = 'strength') {
  const num = workout?.match(/#?\s*(\d+)\s*$/)?.[1];
  if (num && kind === 'strength') {
    const byNum = strengthPlans().find((p) => new RegExp(`#\\s*${num}(\\D|$)`).test(p.title));
    if (byNum) return byNum;
  }
  return planFor(date, kind);
}

const pick = (props, re) => { const k = Object.keys(props).find((n) => re.test(n)); return k ? props[k] : null; };

/** Übungen eines Plans: Plan -> Variation -> Übung, mit Sätzen und Arbeits-/Pausenzeit */
export function planExercises(plan) {
  if (!plan) return [];
  const out = [];
  for (const [name, value] of Object.entries(plan.props)) {
    if (!Array.isArray(value)) continue;
    for (const id of value) {
      const v = typeof id === 'string' ? getPage(id) : null;
      if (!v || v.db !== 'variation') continue;
      const ueIds = Object.values(v.props).filter(Array.isArray).flat().filter((x) => typeof x === 'string');
      const uebungen = ueIds.map(getPage).filter((p) => p?.db === 'uebungen').map((p) => ({ id: p.id, title: p.title, url: p.url }));
      out.push({
        id: v.id, title: v.title, url: v.url, field: name,
        mode: pick(v.props, /^mode$/i), sets: pick(v.props, /^sets?$|sätze/i),
        work: pick(v.props, /work/i), pause: pick(v.props, /pause/i), reps: pick(v.props, /^repetitions?$|wiederhol/i),
        uebungen
      });
    }
  }
  return out;
}

/** IDs der Notion-Übungen, die in Kraft-/Tabata-Plänen vorkommen */
export function plannedUebungIds() {
  const ids = new Set();
  for (const p of pagesOf('plan')) for (const e of planExercises(p)) for (const u of e.uebungen) ids.add(u.id);
  return ids;
}

let plansCache = { key: null, value: null };
/** Alle Kraft-/Tabata-Pläne mit Zeitraum, neueste zuerst (ohne leere Seiten). Zwischengespeichert bis zum nächsten Notion-Sync. */
export function strengthPlans() {
  const key = getDb().prepare('SELECT MAX(synced_at) k FROM notion_page').get().k;
  if (plansCache.key === key && plansCache.value) return plansCache.value;
  plansCache = { key, value: computeStrengthPlans() };
  return plansCache.value;
}

function computeStrengthPlans() {
  const schema = schemaOf('plan')?.props || {};
  const typeProp = Object.keys(schema).find((n) => /^typ(e)?$/i.test(n) && (schema[n] === 'select' || schema[n] === 'status'));
  return pagesOf('plan')
    .map((p) => ({ ...p, range: dateRange(p), title: (p.title || '').split('\n').filter(Boolean).at(-1)?.replace(/^#\s*/, '') ?? p.title }))
    .filter((p) => p.range.start && (!typeProp || KIND.strength.test(p.props[typeProp] || '')))
    .filter((p) => planExercises(p).length)
    .sort((a, b) => b.range.start.localeCompare(a.range.start));
}


/** Lauf-Pläne (Type z. B. "Running") mit Zeitraum */
export function runningPlans() {
  const schema = schemaOf('plan')?.props || {};
  const typeProp = Object.keys(schema).find((n) => /^typ(e)?$/i.test(n) && (schema[n] === 'select' || schema[n] === 'status'));
  if (!typeProp) return [];
  return pagesOf('plan')
    .filter((p) => KIND.run.test(p.props[typeProp] || ''))
    .map((p) => ({ ...p, range: dateRange(p), kind: 'run', title: (p.title || '').trim() }))
    .filter((p) => p.range.start)
    .sort((a, b) => b.range.start.localeCompare(a.range.start));
}

/** Wortstämme (erste 4 Buchstaben, Wörter ab 4 Zeichen) für den Vergleich Plan <-> Garmin-Workout */
export function stems(text) {
  return new Set((text || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 4 && !['running', 'training'].includes(w)).map((w) => w.slice(0, 4)));
}
