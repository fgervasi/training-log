<script>
  import Plot from '$lib/components/Plot.svelte';
  import { fmtDate, fmtTime, fmtDur, fmtKm, fmtPace, fmtNum } from '$lib/format.js';
  let { data } = $props();
  const w = $derived(data.weeks);
  const cur = $derived(w.at(-1));
  const last4 = $derived(w.slice(-5, -1));
  const avg4 = (k) => (last4.length ? last4.reduce((s, x) => s + x[k], 0) / last4.length : 0);
</script>

<main class="page">
  <div class="row">
    <h1>Übersicht</h1>
    {#if !data.notion.plan}<span class="chip warn">Notion noch nicht synchronisiert: <code>npm run sync:notion</code></span>{/if}
  </div>

  {#if !data.total}
    <div class="empty">Noch keine Aktivitäten. Importiere deinen Garmin-Export mit <code>npm run import -- &lt;Pfad&gt;</code>.</div>
  {:else}
    <section class="kpis">
      <div class="kpi"><b>{fmtNum(cur.km, 1)} km</b><span>Laufen diese Woche · Ø {fmtNum(avg4('km'), 1)} km in den 4 Wochen davor</span></div>
      <div class="kpi"><b>{cur.runs}</b><span>Läufe diese Woche · Ø {fmtNum(avg4('runs'), 1)}</span></div>
      <div class="kpi"><b>{cur.tabata}</b><span>Tabata-Einheiten diese Woche · Ø {fmtNum(avg4('tabata'), 1)}</span></div>
      <div class="kpi"><b>{data.total}</b><span>Aktivitäten insgesamt</span></div>
    </section>

    <section class="grid2">
      <div class="panel">
        <h2>Laufkilometer pro Woche</h2>
        <Plot height={220} make={(width, P) => ({
          x: { type: 'band', label: null, tickFormat: (d) => new Date(d).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' }), ticks: w.filter((_, i) => i % 4 === 0).map((d) => d.week) },
          y: { label: 'km', grid: true },
          marks: [P.barY(w, { x: 'week', y: 'km', fill: 'var(--accent)', tip: true, title: (d) => `Woche ab ${d.week}\n${d.km.toFixed(1)} km, ${d.runs} Läufe` }), P.ruleY([0])]
        })} />
      </div>
      <div class="panel">
        <h2>Tabata-Einheiten pro Woche</h2>
        <Plot height={220} make={(width, P) => ({
          x: { type: 'band', label: null, tickFormat: (d) => new Date(d).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' }), ticks: w.filter((_, i) => i % 4 === 0).map((d) => d.week) },
          y: { label: 'Einheiten', grid: true, ticks: Array.from({ length: Math.max(...w.map((d) => d.tabata), 1) + 1 }, (_, i) => i), tickFormat: 'd' },
          marks: [P.barY(w, { x: 'week', y: 'tabata', fill: 'var(--accent-2)', tip: true, title: (d) => `Woche ab ${d.week}\n${d.tabata} Einheiten` }), P.ruleY([0])]
        })} />
      </div>
    </section>

    <section class="panel">
      <h2>Letzte Aktivitäten</h2>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Datum</th><th>Art</th><th class="num">Dauer</th><th class="num">Distanz</th><th class="num">Pace</th><th class="num">Ø Puls</th></tr></thead>
          <tbody>
            {#each data.recent as a}
              <tr class="link" onclick={() => (location.href = a.type === 'run' ? `/laeufe/${a.id}` : `/tabata/${a.id}`)}>
                <td>{fmtDate(a.start_time)} <span class="muted small">{fmtTime(a.start_time)}</span></td>
                <td>{a.type === 'run' ? a.route : 'Tabata'}</td>
                <td class="num">{fmtDur(a.duration_s)}</td>
                <td class="num">{a.type === 'run' ? fmtKm(a.distance_m) + ' km' : ''}</td>
                <td class="num">{a.type === 'run' ? fmtPace(a.avg_speed) : ''}</td>
                <td class="num">{fmtNum(a.avg_hr)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</main>
