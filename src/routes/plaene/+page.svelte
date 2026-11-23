<script>
  import { goto } from '$app/navigation';
  import Plot from '$lib/components/Plot.svelte';
  import { fmtDate, fmtTime, fmtNum, fmtDelta, fmtDur, fmtKm } from '$lib/format.js';
  let { data } = $props();
  const L = (e) => data.labels?.[e]?.label ?? e;
  const hasZone = $derived(data.runs?.some((r) => r.zone) ?? false);
  const avgPerWeek = $derived(data.weeks?.length ? data.weeks.reduce((s, w) => s + w.n, 0) / data.weeks.length : 0);
  const share = (n) => (data.total ? n / data.total : 0);
  const doneCount = $derived(data.tracked?.filter((e) => e.sessions > 0).length ?? 0);
</script>

<main class="page">
  <div class="row">
    <h1>Plan gegen Ist</h1>
    {#if data.plans.length}
      <select id="plan" value={data.sel?.id} onchange={(e) => goto(`?id=${e.currentTarget.value}`, { noScroll: true })}>
        <optgroup label="Kraft">{#each data.plans.filter((p) => p.kind === 'strength') as p}<option value={p.id}>{p.title} · {p.range.start.slice(0, 7)} · {p.sessions} Einheiten</option>{/each}</optgroup>
        <optgroup label="Laufen">{#each data.plans.filter((p) => p.kind === 'run') as p}<option value={p.id}>{p.title} · {p.sessions} Läufe</option>{/each}</optgroup>
      </select>
    {/if}
  </div>

  {#if !data.sel}
    <div class="empty">Keine Trainingspläne aus Notion. Starte „Neue Aktivitäten holen“ in der Übersicht oder <code>pnpm run sync:notion</code>.</div>
  {:else if data.sel.kind === 'run'}
    <section class="kpis">
      <div class="kpi"><b>{data.runs.length}</b><span>Läufe mit passendem Garmin-Workout seit {data.sel.range.start}</span></div>
      <div class="kpi"><b>{fmtNum(avgPerWeek, 1)}</b><span>Läufe pro Woche im Schnitt</span></div>
      <div class="kpi"><b>{data.runs[0] ? fmtDate(data.runs[0].start_time) : '–'}</b><span>zuletzt</span></div>
      <div class="kpi"><b><a href={data.sel.url} target="_blank" rel="noreferrer">{data.sel.title}</a></b><span>in Notion öffnen{#if data.variations[0]?.reps}{' · '}Vorgabe {data.variations[0].reps}{/if}</span></div>
    </section>
    <section class="panel">
      <h2>Läufe pro Woche</h2>
      <Plot height={200} make={(w, P) => ({
        x: { type: 'band', label: null, tickFormat: (d) => new Date(d).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' }), ticks: data.weeks.filter((_, i) => i % 4 === 0).map((d) => d.week) },
        y: { label: 'Läufe', grid: true, ticks: Array.from({ length: Math.max(1, ...data.weeks.map((d) => d.n)) + 1 }, (_, i) => i), tickFormat: 'd' },
        marks: [P.barY(data.weeks, { x: 'week', y: 'n', fill: 'var(--accent)', tip: true, title: (d) => `Woche ab ${d.week}: ${d.n} Läufe` }), P.ruleY([0])]
      })} />
    </section>
    <section class="panel">
      <h2>Läufe</h2>
      <p class="muted small">Zugeordnet über den Namen des Garmin-Workouts. Intervalle und Verlauf je Intervall findest du auf der Seite der Route.</p>
      <div class="tablewrap"><table>
        <thead><tr><th>Datum</th><th>Workout</th><th class="num">Dauer</th><th class="num">Distanz</th><th class="num">Ø Puls</th><th class="num">Intervalle</th><th class="num">Ø Puls Belastung</th>{#if hasZone}<th class="num">Im Zielpuls</th>{/if}</tr></thead>
        <tbody>
          {#each data.runs as r}
            <tr class="link" onclick={() => (location.href = `/laeufe/${r.id}`)}>
              <td>{fmtDate(r.start_time)} <span class="muted small">{fmtTime(r.start_time)}</span></td><td class="small">{r.workout}</td>
              <td class="num">{fmtDur(r.duration_s)}</td><td class="num">{fmtKm(r.distance_m)} km</td><td class="num">{fmtNum(r.avg_hr)}</td>
              <td class="num">{r.intervals > 1 ? r.intervals : ''}</td><td class="num">{r.intervals > 1 ? fmtNum(r.work_hr) : ''}</td>
              {#if hasZone}<td class="num">{r.zone ? `${Math.round(r.zone.share * 100)} %` : ''}</td>{/if}
            </tr>
          {/each}
        </tbody>
      </table></div>
    </section>
  {:else}
    <section class="kpis">
      <div class="kpi"><b>{data.total}</b><span>Einheiten mit diesem Plan{#if data.firstDate} ({data.firstDate} bis {data.lastDate}){/if}</span></div>
      <div class="kpi"><b>{doneCount} / {data.tracked.length}</b><span>geplante Übungen mindestens einmal gemacht</span></div>
      <div class="kpi"><b>{data.extra.length}</b><span>Übungen gemacht, die nicht im Plan stehen</span></div>
      <div class="kpi"><b><a href={data.sel.url} target="_blank" rel="noreferrer">{data.sel.title}</a></b><span>in Notion öffnen</span></div>
    </section>

    {#if !data.total}<div class="empty">Zu diesem Plan gibt es keine Tabata-Einheiten von der Uhr.</div>{/if}

    <section class="panel">
      <h2>Geplante Übungen</h2>
      <p class="muted small">Wie oft jede Übung in den Einheiten dieses Plans vorkam. Eine Einheit gehört zum Plan, wenn das Garmin-Workout dessen Nummer trägt (z. B. „Tabata #15“), sonst über das Datum. Trend: Ø Wiederholungen der zweiten Hälfte gegenüber der ersten, ohne Zählfehler.
        Fehlt eine Übung, obwohl du sie machst, ist sie vermutlich noch nicht <a href="/uebungen">zugeordnet</a>.</p>
      <div class="tablewrap"><table>
        <thead><tr><th>Übung</th><th>Art</th><th class="num">Sätze</th><th>Gemacht</th><th class="num">Zuletzt</th><th class="num">Ø Wdh.</th><th class="num">Trend</th></tr></thead>
        <tbody>
          {#each data.tracked as e}
            <tr class:dim={!e.sessions}>
              <td><a href={e.url} target="_blank" rel="noreferrer">{e.title}</a>{#if e.garmin.length}<br /><span class="muted small">Uhr: {e.garmin.map((g) => data.labels[g]?.garmin ?? g).join(', ')}</span>{/if}</td>
              <td class="small">{e.mode ?? ''}</td>
              <td class="num">{e.sets ?? ''}</td>
              <td><div class="bar"><span style:width="{share(e.sessions) * 100}%"></span></div><span class="small num">{e.sessions} / {data.total}</span></td>
              <td class="num">{e.last ? fmtDate(e.last) : 'nie'}</td>
              <td class="num">{fmtNum(e.avg, 1)}</td>
              <td class="num {e.trend > 0.3 ? 'delta-good' : e.trend < -0.3 ? 'delta-bad' : ''}">{e.trend != null ? fmtDelta(e.trend, 1) : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table></div>
    </section>

    <section class="grid2">
      <div class="panel">
        <h2>Gemacht, aber nicht im Plan</h2>
        {#if data.extra.length}
          <table>
            <thead><tr><th>Übung (Uhr)</th><th class="num">Einheiten</th><th></th></tr></thead>
            <tbody>{#each data.extra as x}<tr><td>{L(x.exercise)}</td><td class="num">{x.sessions}</td><td class="small">{#if !x.mapped}<a href="/uebungen">zuordnen</a>{:else}<span class="muted">anderer Plan</span>{/if}</td></tr>{/each}</tbody>
          </table>
        {:else}<p class="muted small">Alles, was die Uhr erfasst hat, steht im Plan.</p>{/if}
      </div>
      <div class="panel">
        <h2>Nicht von der Uhr erfasst</h2>
        <p class="muted small">Aufwärmen, Massage und Faszienrolle speichert die Uhr nicht als Sätze.</p>
        <ul class="small">{#each data.untracked as e}<li><a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> <span class="muted">· {e.mode}</span></li>{/each}</ul>
      </div>
    </section>
  {/if}
</main>

<style>
  tr.dim td { color: var(--muted); }
  .bar { width: 120px; height: 6px; background: var(--soft); border-radius: 3px; overflow: hidden; display: inline-block; vertical-align: middle; margin-right: 8px; }
  .bar span { display: block; height: 100%; background: var(--accent); }
  ul { margin: 0; padding-left: 18px; display: grid; gap: 2px; }
</style>
