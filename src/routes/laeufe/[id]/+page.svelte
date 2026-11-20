<script>
  import Plot from '$lib/components/Plot.svelte';
  import RunMap from '$lib/components/RunMap.svelte';
  import { goto } from '$app/navigation';
  import { fmtDate, fmtTime, fmtDur, fmtKm, fmtPace, fmtNum, fmtDelta } from '$lib/format.js';
  let { data } = $props();

  const label = (a) => fmtDate(a.start_time);
  // geglättete Pace (min/km) über ±60 m
  function withPace(points) {
    return points.map((p, i) => {
      let j = i, k = i;
      while (j > 0 && p.dist_m - points[j - 1].dist_m < 60) j--;
      while (k < points.length - 1 && points[k + 1].dist_m - p.dist_m < 60) k++;
      const dd = points[k].dist_m - points[j].dist_m, dt = points[k].t - points[j].t;
      const pace = dd > 20 && dt > 0 ? dt / 60 / (dd / 1000) : null;
      return { ...p, km: p.dist_m / 1000, pace: pace && pace < 15 ? pace : null };
    });
  }
  const A = $derived(withPace(data.points).map((p) => ({ ...p, lauf: label(data.run) })));
  const B = $derived(withPace(data.vsPoints).map((p) => ({ ...p, lauf: label(data.vs ?? data.run) })));
  const both = $derived([...A, ...B]);
  const colors = $derived({ domain: [label(data.run), ...(data.vs ? [label(data.vs)] : [])], range: ['var(--accent)', 'var(--accent-2)'] });

  // Zwischenzeiten pro Kilometer
  function splits(points) {
    const out = []; let next = 1000, lastT = 0;
    for (const p of points) {
      if (p.dist_m >= next) { out.push({ km: next / 1000, s: p.t - lastT, hr: p.hr }); lastT = p.t; next += 1000; }
    }
    const last = points.at(-1);
    if (last && last.dist_m > next - 1000 + 100) out.push({ km: +(last.dist_m / 1000).toFixed(2), s: last.t - lastT, partial: true });
    return out;
  }
  const sA = $derived(splits(data.points));
  const sB = $derived(splits(data.vsPoints));

  let hover = $state(null);
  const marker = $derived(hover && hover.lon != null ? [hover.lon, hover.lat] : null);
  const tracks = $derived([
    ...(data.vs ? [{ id: 'vs-' + data.vs.id, color: '#d2652d', coords: data.vsPoints.map((p) => [p.lon, p.lat]) }] : []),
    { id: 'run-' + data.run.id, color: '#1f6f9f', coords: data.points.map((p) => [p.lon, p.lat]) }
  ]);
  const fmtMin = (m) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`;
  const d = (k) => (data.vs && data.run[k] != null && data.vs[k] != null ? data.run[k] - data.vs[k] : null);
  const cls = (v, lowerIsBetter = true) => (v == null || v === 0 ? '' : (v < 0) === lowerIsBetter ? 'delta-good' : 'delta-bad');
  const common = (P) => ({ marginLeft: 48, x: { label: 'km', grid: true }, color: colors });
</script>

<main class="page">
  <div class="row">
    <div>
      <p class="muted small"><a href="/laeufe?route={data.run.route_id}">← {data.run.route}</a></p>
      <h1>{fmtDate(data.run.start_time)}, {fmtTime(data.run.start_time)}</h1>
    </div>
    <label class="row small">Vergleichen mit
      <select id="vs" value={data.vs?.id ?? 'none'} onchange={(e) => goto(`?vs=${e.currentTarget.value}`, { replaceState: true, noScroll: true })}>
        <option value="none">– kein Vergleich –</option>
        {#each data.others as o}<option value={o.id}>{fmtDate(o.start_time)} · {fmtDur(o.duration_s)}</option>{/each}
      </select>
    </label>
  </div>

  <section class="kpis">
    <div class="kpi"><b>{fmtDur(data.run.duration_s)}</b><span>Zeit <span class={cls(d('duration_s'))}>{fmtDelta(d('duration_s'), 0, ' s')}</span></span></div>
    <div class="kpi"><b>{fmtPace(data.run.avg_speed)}</b><span>Pace min/km</span></div>
    <div class="kpi"><b>{fmtNum(data.run.avg_hr)}</b><span>Ø Puls <span class={cls(d('avg_hr'))}>{fmtDelta(d('avg_hr'), 0)}</span></span></div>
    <div class="kpi"><b>{fmtNum(data.run.max_hr)}</b><span>Max. Puls</span></div>
    <div class="kpi"><b>{fmtKm(data.run.distance_m)} km</b><span>Distanz · {fmtNum(data.run.ascent_m)} m Aufstieg</span></div>
  </section>

  <section class="grid2">
    <div class="panel">
      <div class="row small">
        <span><span class="chip">●</span> {label(data.run)}</span>
        {#if data.vs}<span><span class="chip warn">●</span> {label(data.vs)}</span>{/if}
      </div>
      <RunMap {tracks} {marker} height={460} />
    </div>
    <div class="panel">
      <h3>Höhenprofil</h3>
      <Plot height={150} onhover={(v) => (hover = v)} make={(w, P) => ({ ...common(P), y: { label: 'm ü. M.', grid: true, zero: false },
        marks: [P.areaY(A, { x: 'km', y: 'alt_m', fill: 'var(--soft)', y1: (A.length ? Math.min(...A.map((p) => p.alt_m)) - 5 : 0) }), P.lineY(both, { x: 'km', y: 'alt_m', stroke: 'lauf' }),
          P.ruleX(A, P.pointerX({ x: 'km', stroke: 'var(--muted)' })), P.dot(A, P.pointerX({ x: 'km', y: 'alt_m', fill: 'var(--fg)', r: 3 }))] })} />
      <h3>Pace</h3>
      <Plot height={150} onhover={(v) => (hover = v)} make={(w, P) => ({ ...common(P), y: { label: 'min/km', grid: true, reverse: true, tickFormat: fmtMin, ticks: 5 },
        marks: [P.lineY(both.filter((p) => p.pace), { x: 'km', y: 'pace', stroke: 'lauf', z: 'lauf' }),
          P.ruleX(A, P.pointerX({ x: 'km', stroke: 'var(--muted)' })), P.tip(A.filter((p) => p.pace), P.pointerX({ x: 'km', y: 'pace', title: (p) => `km ${p.km.toFixed(2)}\nPace ${fmtMin(p.pace)} · Puls ${p.hr ?? '–'}` }))] })} />
      <h3>Puls</h3>
      <Plot height={150} onhover={(v) => (hover = v)} make={(w, P) => ({ ...common(P), y: { label: 'bpm', grid: true, zero: false },
        marks: [P.lineY(both.filter((p) => p.hr), { x: 'km', y: 'hr', stroke: 'lauf', z: 'lauf' }),
          P.ruleX(A, P.pointerX({ x: 'km', stroke: 'var(--muted)' })), P.dot(A.filter((p) => p.hr), P.pointerX({ x: 'km', y: 'hr', fill: 'var(--fg)', r: 3 }))] })} />
    </div>
  </section>

  <section class="panel">
    <h2>Kilometerzeiten</h2>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Kilometer</th><th class="num">{label(data.run)}</th>{#if data.vs}<th class="num">{label(data.vs)}</th><th class="num">Differenz</th>{/if}<th class="num">Puls am Ende</th></tr></thead>
        <tbody>
          {#each sA as s, i}
            {@const o = sB[i]}
            <tr>
              <td>{s.partial ? `bis ${String(s.km).replace('.', ',')}` : `km ${s.km}`}</td>
              <td class="num">{fmtDur(s.s)}</td>
              {#if data.vs}<td class="num">{o ? fmtDur(o.s) : '–'}</td><td class="num {o && !s.partial ? cls(s.s - o.s) : ''}">{o && !s.partial ? fmtDelta(s.s - o.s, 0, ' s') : ''}</td>{/if}
              <td class="num">{s.hr ?? '–'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</main>
