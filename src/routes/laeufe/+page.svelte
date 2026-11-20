<script>
  import Plot from '$lib/components/Plot.svelte';
  import { fmtDate, fmtTime, fmtDur, fmtKm, fmtPace, fmtNum, paceMin } from '$lib/format.js';
  let { data } = $props();
  const route = $derived(data.routes.find((r) => r.id === data.sel));
  const runs = $derived(data.runs.map((r) => ({
    ...r,
    date: new Date(r.start_time),
    min: r.duration_s / 60,
    pace: paceMin(r.avg_speed),
    // Meter pro Herzschlag: Tempo (m/min) geteilt durch Ø-Puls. Höher = effizienter.
    eff: r.avg_speed && r.avg_hr ? (r.avg_speed * 60) / r.avg_hr : null
  })));
  const best = $derived(runs.length ? runs.reduce((a, b) => (a.duration_s < b.duration_s ? a : b)) : null);
  let editing = $state(false);
  const fmtMin = (m) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`;
</script>

<main class="page">
  <div class="row">
    <h1>Läufe</h1>
    <nav class="tabs">
      {#each data.routes as r}
        <a href="?route={r.id}" class:on={r.id === data.sel}>{r.name} · {r.n}×</a>
      {/each}
    </nav>
  </div>

  {#if !route}
    <div class="empty">Noch keine Läufe importiert.</div>
  {:else}
    <div class="row">
      {#if editing}
        <form method="POST" action="?/rename" class="row" onsubmit={() => (editing = false)}>
          <input type="hidden" name="id" value={route.id} />
          <input type="text" id="route-name" name="name" value={route.name} aria-label="Routenname" />
          <button class="btn">Speichern</button>
          <button type="button" class="btn ghost" onclick={() => (editing = false)}>Abbrechen</button>
        </form>
      {:else}
        <h2>{route.name} <button class="btn ghost" onclick={() => (editing = true)}>Umbenennen</button></h2>
      {/if}
      <span class="muted small">{route.n} Läufe · Ø {fmtKm(route.dist)} km{best ? ` · Bestzeit ${fmtDur(best.duration_s)} am ${fmtDate(best.start_time)}` : ''}</span>
    </div>

    <section class="grid2">
      <div class="panel">
        <h2>Zeit und Puls im Verlauf</h2>
        <p class="muted small">Gesamtzeit pro Lauf. Die dicke Linie ist der Schnitt über 7 Läufe. Pace und Puls im Tooltip.</p>
        <Plot height={240} make={(width, P) => ({
          marginLeft: 48,
          x: { type: 'utc', label: null },
          y: { label: 'Minuten', grid: true, tickFormat: fmtMin },
          marks: [
            P.lineY(runs, { x: 'date', y: 'min', stroke: 'var(--accent)', curve: 'monotone-x' }),
            P.dot(runs, { x: 'date', y: 'min', fill: 'var(--accent)', r: 3 }),
            P.lineY(runs, P.windowY({ k: 7 }, { x: 'date', y: 'min', stroke: 'var(--fg)', strokeOpacity: 0.35, strokeWidth: 3 })),
            P.tip(runs, P.pointerX({ x: 'date', y: 'min', title: (d) => `${fmtDate(d.start_time)}\nZeit ${fmtDur(d.duration_s)} · Pace ${fmtPace(d.avg_speed)}\nØ Puls ${fmtNum(d.avg_hr)} · max ${fmtNum(d.max_hr)}` }))
          ]
        })} />
      </div>
      <div class="panel">
        <h2>Fitness: Meter pro Herzschlag</h2>
        <p class="muted small">Tempo geteilt durch Puls. Steigt die Kurve, läufst du bei gleichem Puls schneller.</p>
        <Plot height={240} make={(width, P) => ({
          x: { type: 'utc', label: null },
          y: { label: 'm / Schlag', grid: true, zero: false },
          marks: [
            P.dot(runs.filter((d) => d.eff), { x: 'date', y: 'eff', fill: 'var(--accent-2)', r: 3 }),
            P.lineY(runs.filter((d) => d.eff), P.windowY({ k: 7 }, { x: 'date', y: 'eff', stroke: 'var(--accent-2)', strokeWidth: 2.5 })),
            P.tip(runs.filter((d) => d.eff), P.pointerX({ x: 'date', y: 'eff', title: (d) => `${fmtDate(d.start_time)}\n${d.eff.toFixed(2)} m pro Schlag\nPace ${fmtPace(d.avg_speed)} bei Ø ${fmtNum(d.avg_hr)} bpm` }))
          ]
        })} />
      </div>
    </section>

    <section class="panel">
      <h2>Abschnitte</h2>
      {#if !data.segments.length}
        <p class="muted small">Noch keine Abschnitte. Öffne einen Lauf und lege im Höhenprofil ein Stück fest, etwa einen Anstieg. Die App misst dann seine Zeit in allen Läufen dieser Route.</p>
      {:else}
        <div class="grid2">
          {#each data.segments as seg}
            {@const res = seg.results.map((r) => ({ ...r, date: new Date(r.start_time) }))}
            {@const sBest = res.length ? res.reduce((a, b) => (a.s < b.s ? a : b)) : null}
            {@const sLast = res.at(-1)}
            <div class="seg">
              <div class="row">
                <h3>{seg.name} <span class="muted small">km {fmtNum(seg.start_km, 2)}–{fmtNum(seg.end_km, 2)}</span></h3>
                <form method="POST" action="?/deleteSegment"><input type="hidden" name="id" value={seg.id} /><button class="btn ghost small-btn" title="Abschnitt löschen">Löschen</button></form>
              </div>
              {#if res.length}
                <p class="small">Zuletzt <b class="num">{fmtDur(sLast.s)}</b> · Bestzeit <b class="num">{fmtDur(sBest.s)}</b> am {fmtDate(sBest.start_time)} · in {res.length} von {runs.length} Läufen gefunden</p>
                <Plot height={180} make={(w, P) => ({
                  marginLeft: 44, x: { type: 'utc', label: null, ticks: 6 }, y: { label: 'Zeit', grid: true, tickFormat: (s) => fmtDur(s) },
                  marks: [P.dot(res, { x: 'date', y: 's', fill: 'var(--accent)', r: 2.5 }), P.lineY(res, P.windowY({ k: 7 }, { x: 'date', y: 's', stroke: 'var(--accent)', strokeWidth: 2 })),
                    P.tip(res, P.pointerX({ x: 'date', y: 's', title: (d) => `${fmtDate(d.start_time)}\n${fmtDur(d.s)} · Ø Puls ${fmtNum(d.avg_hr)} · max ${fmtNum(d.max_hr)}` }))]
                })} />
              {:else}<p class="muted small">In keinem Lauf gefunden.</p>{/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="panel">
      <h2>Pace und Puls</h2>
      <p class="muted small">Jeder Punkt ein Lauf, je dunkler, desto neuer. Oben links = schnell bei niedrigem Puls.</p>
      <Plot height={280} make={(width, P) => ({
        marginLeft: 48,
        x: { label: 'Ø Puls (bpm)', grid: true },
        y: { label: 'Pace (min/km)', grid: true, reverse: true, tickFormat: fmtMin },
        color: { type: 'utc', scheme: 'blues', legend: false },
        marks: [
          P.dot(runs.filter((d) => d.pace && d.avg_hr), { x: 'avg_hr', y: 'pace', fill: 'date', stroke: 'var(--line)', r: 5, tip: true,
            title: (d) => `${fmtDate(d.start_time)}\nPace ${fmtPace(d.avg_speed)} · Ø ${fmtNum(d.avg_hr)} bpm` })
        ]
      })} />
    </section>

    <section class="panel">
      <h2>Alle Läufe</h2>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Datum</th><th class="num">Zeit</th><th class="num">Distanz</th><th class="num">Pace</th><th class="num">Ø Puls</th><th class="num">Max</th><th class="num">Aufstieg</th><th class="num">m/Schlag</th></tr></thead>
          <tbody>
            {#each [...runs].reverse() as r}
              <tr class="link" onclick={() => (location.href = `/laeufe/${r.id}`)}>
                <td>{fmtDate(r.start_time)} <span class="muted small">{fmtTime(r.start_time)}</span></td>
                <td class="num">{fmtDur(r.duration_s)}</td>
                <td class="num">{fmtKm(r.distance_m)} km</td>
                <td class="num">{fmtPace(r.avg_speed)}</td>
                <td class="num">{fmtNum(r.avg_hr)}</td>
                <td class="num">{fmtNum(r.max_hr)}</td>
                <td class="num">{fmtNum(r.ascent_m)} m</td>
                <td class="num">{fmtNum(r.eff, 2)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</main>

<style>
  .seg { display: grid; gap: 6px; min-width: 0; }
  .small-btn { padding: 3px 8px; font-size: 12px; }
</style>
