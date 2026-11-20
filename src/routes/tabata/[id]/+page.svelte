<script>
  import Plot from '$lib/components/Plot.svelte';
  import { fmtDate, fmtTime, fmtDur, fmtNum } from '$lib/format.js';
  let { data } = $props();
  const L = (e) => data.labels[e]?.label ?? e;
  const work = $derived(data.sets.filter((s) => s.round > 0));
  const warm = $derived(data.sets.filter((s) => s.round === 0));
  const rounds = $derived([...new Set(work.map((s) => s.round))]);
  // Übungen in der Reihenfolge der ersten Runde; gleiche Übung zweimal hintereinander bleibt getrennt (Position)
  const slots = $derived([...new Set(work.map((s) => s.pos))].sort((a, b) => a - b).map((pos) => ({ pos, exercise: work.find((s) => s.pos === pos).exercise })));
  const cell = (round, pos) => work.find((s) => s.round === round && s.pos === pos);
  const prevAvg = $derived.by(() => {
    const m = {};
    for (const s of data.prevSets) if (s.round > 0 && s.reps != null) (m[s.pos] ??= []).push(s.reps);
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
  });
  const avgOf = (pos) => { const v = work.filter((s) => s.pos === pos && s.reps != null).map((s) => s.reps); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  // Farbskala bis 25 Wdh., damit einzelne Zählfehler (40+) die Skala nicht dominieren
  const maxReps = $derived(Math.min(25, Math.max(1, ...work.map((s) => s.reps ?? 0))));
  const hrData = $derived(data.sets.filter((s) => s.avg_hr).map((s) => ({ ...s, t: new Date(s.start_time), label: L(s.exercise) })));
  const linkedField = (f) => f.linked.map((l) => l.title).join(', ');
</script>

<main class="page">
  <div>
    <p class="muted small"><a href="/tabata">← Tabata</a></p>
    <h1>{fmtDate(data.a.start_time)}, {fmtTime(data.a.start_time)}</h1>
  </div>

  <section class="kpis">
    <div class="kpi"><b>{rounds.length} × {slots.length}</b><span>Runden × Übungen</span></div>
    <div class="kpi"><b>{fmtNum(work.reduce((s, x) => s + (x.reps ?? 0), 0))}</b><span>Wiederholungen gezählt ({work.filter((s) => s.reps != null).length} von {work.length} Intervallen)</span></div>
    <div class="kpi"><b>{fmtNum(data.a.avg_hr)} / {fmtNum(data.a.max_hr)}</b><span>Ø / max. Puls</span></div>
    <div class="kpi"><b>{fmtDur(data.a.duration_s)}</b><span>Dauer · Trainingseffekt {fmtNum(data.a.training_effect, 1)}</span></div>
  </section>

  {#if data.plans.length}
    <section class="panel">
      <h2>Aus Notion</h2>
      {#each data.plans as p}
        <div>
          <h3><a href={p.url} target="_blank" rel="noreferrer">{p.title}</a></h3>
          <dl>
            {#each p.fields as f}
              <dt>{f.name}</dt>
              <dd>
                {#if f.linked}
                  {#each f.linked as l}
                    <div><a href={l.url} target="_blank" rel="noreferrer">{l.title}</a>
                      {#if l.children.length}<span class="muted small"> · {l.children.map((c) => (c.linked ? `${c.name}: ${linkedField(c)}` : `${c.name}: ${Array.isArray(c.value) ? c.value.join(', ') : typeof c.value === 'object' ? JSON.stringify(c.value) : c.value}`)).join(' · ')}</span>{/if}
                    </div>
                  {/each}
                {:else}{Array.isArray(f.value) ? f.value.join(', ') : typeof f.value === 'object' ? JSON.stringify(f.value) : f.value}{/if}
              </dd>
            {/each}
          </dl>
        </div>
      {/each}
    </section>
  {/if}

  <section class="panel">
    <h2>Wiederholungen pro Runde</h2>
    <p class="muted small">Je dunkler, desto mehr Wiederholungen. Leer: nicht gezählt.{#if data.prev}{' '}Vergleich: Ø der Einheit vom <a href="/tabata/{data.prev.id}">{fmtDate(data.prev.start_time)}</a>.{/if}</p>
    <div class="tablewrap">
      <table class="grid">
        <thead><tr><th>Übung</th>{#each rounds as r}<th class="num">R{r}</th>{/each}<th class="num">Ø</th>{#if data.prev}<th class="num">vorher</th>{/if}</tr></thead>
        <tbody>
          {#each slots as sl}
            {@const avg = avgOf(sl.pos)}
            {@const pv = prevAvg[sl.pos]}
            <tr>
              <td>{L(sl.exercise)}</td>
              {#each rounds as r}
                {@const c = cell(r, sl.pos)}
                <td class="num heat" style:--a={c?.reps != null ? Math.min(1, c.reps / maxReps) : 0} title={c?.avg_hr ? `Puls Ø ${Math.round(c.avg_hr)}` : ''}>{c?.reps ?? ''}</td>
              {/each}
              <td class="num"><b>{fmtNum(avg, 1)}</b></td>
              {#if data.prev}<td class="num {avg != null && pv != null ? (avg >= pv ? 'delta-good' : 'delta-bad') : ''}">{fmtNum(pv, 1)}</td>{/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if warm.length}<p class="muted small">Aufwärmen: {warm.map((s) => L(s.exercise)).join(', ')}</p>{/if}
  </section>

  <section class="panel">
    <h2>Puls pro Intervall</h2>
    <Plot height={220} make={(w, P) => ({
      x: { type: 'utc', label: null, tickFormat: (d) => d.toLocaleTimeString('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }) },
      y: { label: 'bpm', grid: true, zero: false },
      marks: [
        P.ruleX(hrData, { x: 't', y1: (d) => d.avg_hr, y2: (d) => d.max_hr, stroke: 'var(--line)', strokeWidth: 3 }),
        P.dot(hrData, { x: 't', y: 'avg_hr', fill: (d) => (d.round === 0 ? 'var(--muted)' : 'var(--accent-2)'), r: 3.5, tip: true,
          title: (d) => `${d.label}${d.round ? ` · Runde ${d.round}` : ' · Aufwärmen'}\nØ ${Math.round(d.avg_hr)} · max ${d.max_hr} bpm${d.reps != null ? `\n${d.reps} Wdh.` : ''}` })
      ]
    })} />
  </section>
</main>

<style>
  .heat { background: color-mix(in srgb, var(--accent-2) calc(var(--a) * 55%), transparent); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 8px 0 0; }
  dt { color: var(--muted); font-size: 13px; }
  dd { margin: 0; }
</style>
