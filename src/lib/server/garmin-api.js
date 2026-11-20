// Garmin Connect Personal API (offiziell, nur lesend).
// Ablauf: API-Key gegen ein Zugriffstoken tauschen, Aktivitäten suchen, FIT-Datei (als ZIP) laden.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

const BASE = 'https://personal.connectapi.garmin.com';
const TOKEN_URL = `${BASE}/personalapitoken-service/personal-api/personal-api-key/token`;
const TOKEN_FILE = path.join(DATA_DIR, 'garmin-token.json');

function jwtExp(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp ?? null; } catch { return null; }
}

async function fetchToken(apiKey) {
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { Authorization: `ApiKey ${apiKey}`, Accept: '*/*' } });   // wie im offiziellen Client; Antwort ist das Token als Text
  const text = await res.text();
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? ' Ist der Key abgelaufen oder falsch kopiert? (Garmin Connect → Personal API Key)' : '';
    throw new Error(`Token-Tausch fehlgeschlagen (HTTP ${res.status}).${hint}`);
  }
  let body; try { body = JSON.parse(text); } catch { body = { access_token: text.trim() }; }
  if (typeof body === 'string') body = { access_token: body };
  const access = body.access_token ?? body.accessToken ?? body.token;
  if (!access) throw new Error(`Unerwartete Antwort beim Token-Tausch: Felder ${Object.keys(body).join(', ')}`);
  const exp = jwtExp(access) ?? (body.expires_in ? Math.floor(Date.now() / 1000) + body.expires_in : Math.floor(Date.now() / 1000) + 3000);
  const tok = { access, exp };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tok), { mode: 0o600 });
  return tok;
}

export class GarminClient {
  constructor(apiKey) {
    if (!apiKey) throw new Error('GARMIN_API_KEY fehlt in .env');
    this.apiKey = apiKey;
    this.token = null;
  }

  async auth() {
    const now = Math.floor(Date.now() / 1000);
    if (!this.token && fs.existsSync(TOKEN_FILE)) {
      try { this.token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); } catch { this.token = null; }
    }
    if (!this.token || this.token.exp - 60 < now) this.token = await fetchToken(this.apiKey);
    return this.token.access;
  }

  async get(p, { raw = false, retry = true } = {}) {
    const res = await fetch(BASE + p, { headers: { Authorization: `Bearer ${await this.auth()}`, Accept: raw ? 'application/zip, application/x-zip-compressed, application/octet-stream' : 'application/json' } });
    if (res.status === 401 && retry) { this.token = null; fs.rmSync(TOKEN_FILE, { force: true }); return this.get(p, { raw, retry: false }); }
    if (res.status === 429) throw new Error('Garmin meldet zu viele Anfragen (HTTP 429). Später erneut versuchen.');
    if (!res.ok) throw new Error(`GET ${p} fehlgeschlagen (HTTP ${res.status})`);
    return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
  }

  /** Alle Aktivitäten ab startDate (YYYY-MM-DD), seitenweise */
  async activitiesSince(startDate, pageSize = 50) {
    const out = [];
    for (let start = 0; ; start += pageSize) {
      const q = new URLSearchParams({ start, limit: pageSize, ...(startDate ? { startDate } : {}) });
      const page = await this.get(`/activitylist-service/activities/search/activities?${q}`);
      const list = Array.isArray(page) ? page : page.activityList ?? page.activities ?? [];
      out.push(...list);
      if (list.length < pageSize) break;
    }
    return out;
  }

  /** Original-FIT-Datei einer Aktivität (Garmin liefert ein ZIP) */
  download(activityId) {
    return this.get(`/download-service/files/activity/${activityId}`, { raw: true });
  }
}

/** Nur Aktivitätsarten laden, die die App auswertet */
export const isRelevantType = (typeKey = '') => /run|hiit|strength|training|cardio/i.test(typeKey);
