<script>
  import Plot from '$lib/components/Plot.svelte';
  import { goto } from '$app/navigation';
  import { fmtDate, fmtDur, fmtNum } from '$lib/format.js';
  let { data } = $props();
  const L = (e) => data.labels[e]?.label ?? e;

  // pro Einheit: Ø Wiederholungen pro Intervall der gewählten Übung, erste und letzte Runde
  const perSession = $derived.by(() => {
    const m = new Map();
    for (const s of data.sets) {
      if (!m.has(s.activity_id)) m.set(s.activity_id, { id: s.activity_id, date: new Date(s.start_time), start_time: s.start_time, reps: [], rounds: [] });
      const x = m.get(s.activity_id);
      if (s.reps_ok != null) { x.reps.push(s.reps_ok); x.rounds.push({ ...s, reps: s.reps_ok }); }
    }
    return [...m.values()].filter((x) => x.reps.length).map((x) => ({
      ...x, avg: x.reps.reduce((a, b) => a + b, 0) / x.reps.length,
      first: x.rounds[0].reps, last: x.rounds.at(-1).reps, drop: x.rounds.length > 1 ? x.rounds.at(-1).reps - x.rounds[0].reps : null
    }));
  });
  const dots = $derived(data.sets.filter((s) => s.reps_ok != null).map((s) => ({ ...s, date: new Date(s.start_time) })));
  const badDots = $derived(data.sets.filter((s) => s.bad).map((s) => ({ ...s, date: new Date(s.start_time) })));
  const exInfo = $derived(data.exercises.find((e) => e.exercise === data.ex));
</script>

<main class="page">
  <h1>Tabata</h1>

  {#if !data.sessions.length}
    <div class="empty">Noch keine Tabata-Einheiten importiert.</div>
  {:else}
    <section class="panel">
      <div class="row">
        <h2>Fortschritt pro Übung</h2>
        <select id="exercise" value={data.ex} onchange={(e) => goto(`?ex=${encodeURIComponent(e.currentTarget.value)}`, { noScroll: true })}>
          {#each data.exercises as e}<option value={e.exercise}>{L(e.exercise)} · {e.sessions}×</option>{/each}
        </select>
      </div>
      <p class="muted small">Wiederholungen pro 20-Sekunden-Intervall. Kleine Punkte: jede Runde, Linie: Schnitt pro Einheit.
        {#if exInfo && exInfo.counted === 0}<span class="chip warn">Für diese Übung hat die Uhr keine Wiederholungen gezählt</span>{/if}</p>
      <Plot height={260} make={(w, P) => ({
        x: { type: 'utc', label: null },
        y: { label: 'Wdh. / Intervall', grid: true, zero: true },
        marks: [
          P.dot(dots, { x: 'date', y: 'reps', r: 2, fill: 'var(--muted)', fillOpacity: 0.35 }),
          P.dot(badDots, { x: 'date', y: 'reps', r: 3, stroke: 'var(--bad)', fill: 'none', tip: true, title: (d) => `${fmtDate(d.start_time)}: ${d.reps} Wdh.\nvermutlich Zählfehler, nicht im Schnitt` }),
          P.lineY(perSession, { x: 'date', y: 'avg', stroke: 'var(--accent-2)', strokeWidth: 2.5, marker: 'circle' }),
          P.tip(perSession, P.pointerX({ x: 'date', y: 'avg', title: (d) => `${fmtDate(d.start_time)}\nØ ${d.avg.toFixed(1)} Wdh. (${d.reps.join(' · ')})\nerste → letzte Runde: ${d.first} → ${d.last}` }))
        ]
      })} />
      <p class="muted small">Die Uhr zählt nicht jede Übung zuverlässig. Rot umrandet: vermutliche Zählfehler (mehr als doppelt so viele Wiederholungen wie üblich). Sie fliessen nicht in die Schnitte ein.</p>
    </section>

    <section class="panel">
      <h2>Programme</h2>
      <p class="muted small">Einheiten mit derselben Übungsfolge sind zu einem Programm zusammengefasst. Der Name kommt aus dem Notion-Trainingsplan, sobald synchronisiert.</p>
      <div class="tablewrap"><table>
        <thead><tr><th>Programm</th><th class="num">Einheiten</th><th>Zeitraum</th><th>Übungen</th></tr></thead>
        <tbody>
          {#each data.programs as p}
            <tr><td>{p.label}</td><td class="num">{p.n}</td><td class="small">{p.first} – {p.last}</td><td class="small muted">{p.key.split(',').map(L).join(', ')}</td></tr>
          {/each}
        </tbody>
      </table></div>
    </section>

    <section class="panel">
      <h2>Alle Einheiten</h2>
      <div class="tablewrap"><table>
        <thead><tr><th>Datum</th><th>Programm</th><th class="num">Runden × Übungen</th><th class="num">Intervalle</th><th class="num">Wdh. gezählt</th><th class="num">Ø Puls</th><th class="num">Max</th><th class="num">Dauer</th></tr></thead>
        <tbody>
          {#each data.sessions as s}
            <tr class="link" onclick={() => (location.href = `/tabata/${s.id}`)}>
              <td>{fmtDate(s.start_time)}</td><td>{s.programLabel}</td>
              <td class="num">{s.blocks}</td><td class="num">{s.intervals}</td>
              <td class="num">{fmtNum(s.reps)} <span class="muted">({s.counted}/{s.intervals}){#if s.bad} · {s.bad} Zählfehler{/if}</span></td>
              <td class="num">{fmtNum(s.avg_hr)}</td><td class="num">{fmtNum(s.max_hr)}</td><td class="num">{fmtDur(s.duration_s)}</td>
            </tr>
          {/each}
        </tbody>
      </table></div>
    </section>
  {/if}
</main>
