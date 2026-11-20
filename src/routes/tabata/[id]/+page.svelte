<script>
  import Plot from '$lib/components/Plot.svelte';
  import { fmtDate, fmtTime, fmtDur, fmtNum } from '$lib/format.js';
  import { toBlocks, blockSummary } from '$lib/blocks.js';
  let { data } = $props();
  const L = (e) => data.labels[e]?.label ?? e;
  const work = $derived(data.sets.filter((s) => s.round > 0));
  const firstWork = $derived(work[0]?.idx ?? Infinity);
  const lastWork = $derived(work.at(-1)?.idx ?? -1);
  const warm = $derived(data.sets.filter((s) => s.round === 0 && s.idx < firstWork));
  const cool = $derived(data.sets.filter((s) => s.round === 0 && s.idx > lastWork));
  const blocks = $derived(toBlocks(data.sets));
  const prevBlocks = $derived(toBlocks(data.prevSets));
  const cell = (round, pos) => round.sets.find((s) => s.pos === pos);
  const repsAt = (block, pos) => block.rounds.map((r) => cell(r, pos)?.reps_ok).filter((v) => v != null);
  const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const prevAvg = (block, pos) => { const pb = prevBlocks.find((x) => x.sig === block.sig); return pb ? mean(repsAt(pb, pos)) : null; };
  const maxReps = $derived(Math.max(1, ...work.map((s) => s.reps_ok ?? 0)));
  const hrData = $derived(data.sets.filter((s) => s.avg_hr).map((s) => ({ ...s, t: new Date(s.start_time), label: L(s.exercise) })));
</script>

<main class="page">
  <div>
    <p class="muted small"><a href="/tabata">← Tabata</a></p>
    <h1>{fmtDate(data.a.start_time)}, {fmtTime(data.a.start_time)}</h1>
  </div>

  <section class="kpis">
    <div class="kpi"><b>{blockSummary(blocks)}</b><span>Runden × Übungen{blocks.length > 1 ? ` in ${blocks.length} Blöcken` : ''}</span></div>
    <div class="kpi"><b>{fmtNum(work.reduce((s, x) => s + (x.reps_ok ?? 0), 0))}</b><span>Wiederholungen gezählt ({work.filter((s) => s.reps_ok != null).length} von {work.length} Intervallen{work.some((s) => s.bad) ? `, ${work.filter((s) => s.bad).length} Zählfehler ausgelassen` : ''})</span></div>
    <div class="kpi"><b>{fmtNum(data.a.avg_hr)} / {fmtNum(data.a.max_hr)}</b><span>Ø / max. Puls</span></div>
    <div class="kpi"><b>{fmtDur(data.a.duration_s)}</b><span>Dauer · Trainingseffekt {fmtNum(data.a.training_effect, 1)}</span></div>
  </section>

  {#if data.plan}
    <section class="panel">
      <div class="row">
        <h2>Trainingsplan: <a href={data.plan.url} target="_blank" rel="noreferrer">{data.plan.title}</a></h2>
        <span class="muted small">gültig {data.plan.range.start} bis {data.plan.range.end ?? 'offen'}</span>
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th>Übung im Plan</th><th>Art</th><th class="num">Sätze</th><th class="num">Arbeit / Pause</th><th>In dieser Einheit</th></tr></thead>
        <tbody>
          {#each data.planned as e}
            <tr class:dim={!e.done}>
              <td><a href={e.url} target="_blank" rel="noreferrer">{e.title}</a>{#if e.uebungen.length && e.uebungen[0].title !== e.title}<span class="muted small"> · {e.uebungen.map((u) => u.title).join(', ')}</span>{/if}</td>
              <td class="small">{e.mode ?? ''}</td>
              <td class="num">{e.sets ?? ''}</td>
              <td class="num">{e.work ? `${e.work} / ${e.pause ?? '–'} s` : (e.reps ?? '')}</td>
              <td>{#if e.done}<span class="chip">✓ gemacht</span>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table></div>
      {#if data.unmapped.length}
        <p class="small"><span class="chip warn">{data.unmapped.length} Garmin-Übungen ohne Zuordnung</span> {data.unmapped.map(L).join(', ')} · <a href="/uebungen">zuordnen</a></p>
      {/if}
    </section>
  {:else}
    <p class="muted small">Für dieses Datum gibt es keinen Trainingsplan in Notion.</p>
  {/if}

  <section class="panel">
    <h2>Wiederholungen pro Runde</h2>
    <p class="muted small">Je dunkler, desto mehr Wiederholungen. Leer: nicht gezählt. Durchgestrichen: vermutlich Zählfehler.{#if data.prev}{' '}Vergleich: Ø der Einheit vom <a href="/tabata/{data.prev.id}">{fmtDate(data.prev.start_time)}</a>.{/if}</p>
    {#each blocks as block}
      {#if blocks.length > 1}<h3>Block {block.no} · {block.rounds.length} {block.rounds.length === 1 ? 'Runde' : 'Runden'} à {block.seq.length} {block.seq.length === 1 ? 'Übung' : 'Übungen'}</h3>{/if}
      <div class="tablewrap">
        <table class="grid">
          <thead><tr><th>Übung</th>{#each block.rounds as r, i}<th class="num">R{i + 1}</th>{/each}<th class="num">Ø</th>{#if data.prev}<th class="num">vorher</th>{/if}</tr></thead>
          <tbody>
            {#each block.slots as sl}
              {@const avg = mean(repsAt(block, sl.pos))}
              {@const pv = prevAvg(block, sl.pos)}
              <tr>
                <td>{L(sl.exercise)}</td>
                {#each block.rounds as r}
                  {@const c = cell(r, sl.pos)}
                  <td class="num heat" class:bad={c?.bad} style:--a={c?.reps_ok != null ? Math.min(1, c.reps_ok / maxReps) : 0} title={c?.bad ? 'Vermutlich Zählfehler, nicht im Schnitt' : c?.avg_hr ? `Puls Ø ${Math.round(c.avg_hr)}` : ''}>{c?.reps ?? ''}</td>
                {/each}
                <td class="num"><b>{fmtNum(avg, 1)}</b></td>
                {#if data.prev}<td class="num {avg != null && pv != null ? (avg >= pv ? 'delta-good' : 'delta-bad') : ''}">{fmtNum(pv, 1)}</td>{/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/each}
    {#if warm.length || cool.length}<p class="muted small">{#if warm.length}Aufwärmen: {warm.map((s) => L(s.exercise)).join(', ')}{/if}{#if warm.length && cool.length}{' · '}{/if}{#if cool.length}Ausklang: {cool.map((s) => L(s.exercise)).join(', ')}{/if}</p>{/if}
  </section>

  <section class="panel">
    <h2>Puls pro Intervall</h2>
    <Plot height={220} make={(w, P) => ({
      x: { type: 'utc', label: null, tickFormat: (d) => d.toLocaleTimeString('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }) },
      y: { label: 'bpm', grid: true, zero: false },
      marks: [
        P.ruleX(hrData, { x: 't', y1: (d) => d.avg_hr, y2: (d) => d.max_hr, stroke: 'var(--line)', strokeWidth: 3 }),
        P.dot(hrData, { x: 't', y: 'avg_hr', fill: (d) => (d.round === 0 ? 'var(--muted)' : 'var(--accent-2)'), r: 3.5, tip: true,
          title: (d) => `${d.label}${d.round ? ` · Runde ${d.round}` : d.idx < firstWork ? ' · Aufwärmen' : ' · Ausklang'}\nØ ${Math.round(d.avg_hr)} · max ${d.max_hr} bpm${d.reps != null ? `\n${d.reps} Wdh.` : ''}` })
      ]
    })} />
  </section>
</main>

<style>
  .heat { background: color-mix(in srgb, var(--accent-2) calc(var(--a) * 55%), transparent); }
  tr.dim td { color: var(--muted); }
  td.bad { text-decoration: line-through; color: var(--bad); }
</style>
