// Aufruf: npm run sync:notion   (liest .env)
import { syncNotion } from '../src/lib/server/notion.js';

try {
  const s = await syncNotion();
  console.log('\nFertig:', Object.entries(s).map(([k, n]) => `${k} ${n}`).join(', '));
} catch (e) {
  console.error('Notion-Sync fehlgeschlagen:', e.body || e.message);
  if (e.code === 'object_not_found') console.error('Ist die Datenbank in Notion mit der Integration verbunden? (··· → Connections)');
  process.exit(1);
}
