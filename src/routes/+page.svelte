<script>
  import ActivityIcon from '$lib/components/ActivityIcon.svelte';
  import { fmtDate, fmtTime, fmtDur, fmtKm, fmtNum } from '$lib/format.js';
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  let { data } = $props();

  const AUTO_SYNC_H = 6;   // automatisch synchronisieren, wenn der letzte Sync älter ist
  let syncing = $state(false);
  let syncMsg = $state('');
  async function sync() {
    if (syncing) return;
    syncing = true; syncMsg = '';
    try {
      const r = await fetch('/api/sync', { method: 'POST' }).then((x) => x.json());
      const g = r.garmin;
      syncMsg = r.errors.length ? r.errors.join(' · ') : g?.new ? `${g.runs} Läufe und ${g.tabata} Tabata-Einheiten neu` : 'Keine neuen Aktivitäten';
      await invalidateAll();
    } catch (e) { syncMsg = `Sync fehlgeschlagen: ${e.message}`; }
    syncing = false;
  }
  onMount(() => {
    const at = data.sync?.at ? new Date(data.sync.at) : null;
    if (!at || Date.now() - at > AUTO_SYNC_H * 3600e3) sync();
  });
  const ago = (iso) => {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    return m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} min` : m < 1440 ? `vor ${Math.round(m / 60)} h` : `am ${fmtDate(iso)}`;
  };

  const k = $derived(data.kpis);
  const monthLabel = $derived(new Date(data.month + '-01T12:00:00Z').toLocaleDateString('de-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
  const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const href = (a) => (a.type === 'run' ? `/laeufe/${a.id}` : `/tabata/${a.id}`);
  const title = (a) => (a.type === 'run' ? (a.route ?? 'Lauf').replace(/\s+running\b/i, '') : a.workout ?? 'Tabata');
  const short = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, '0')} h` : `${Math.round(s / 60)} min`);
  const detail = (a) => (a.type === 'run' ? `${fmtNum((a.distance_m || 0) / 1000, 1)} km · ${short(a.duration_s)}` : short(a.duration_s));
  const full = (a) => (a.type === 'run' ? `${fmtKm(a.distance_m)} km · ${fmtDur(a.duration_s)}` : fmtDur(a.duration_s));
  const tip = (a) => `${a.type === 'run' ? a.route ?? 'Lauf' : title(a)}\n${fmtDate(a.start_time)}, ${fmtTime(a.start_time)}\n${full(a)}${a.avg_hr ? ` · Ø ${Math.round(a.avg_hr)} bpm` : ''}`;
</script>

<main class="page">
  <div class="row">
    <h1>Übersicht</h1>
    <div class="row small">
      <span class="muted">{#if syncing}Synchronisiere Garmin und Notion …{:else if syncMsg}{syncMsg}{:else if data.sync}Zuletzt synchronisiert {ago(data.sync.at)}{#if data.sync.errors.length}{' · '}<span class="delta-bad">{data.sync.errors.join(' · ')}</span>{/if}{:else}Noch nie synchronisiert{/if}</span>
      <button class="btn" onclick={sync} disabled={syncing}>{syncing ? 'Läuft …' : 'Neue Aktivitäten holen'}</button>
    </div>
  </div>

  {#if !data.total}
    <div class="empty">Noch keine Aktivitäten. Klicke auf „Neue Aktivitäten holen“ oder importiere deinen Garmin-Export mit <code>pnpm run import -- &lt;Pfad&gt;</code>.</div>
  {:else}
    <section class="kpis">
      <div class="kpi"><b>{fmtNum(k.cur.km, 1)} km</b><span>Laufen diese Woche · Ø {fmtNum(k.avg4.km, 1)} km in den 4 Wochen davor</span></div>
      <div class="kpi"><b>{k.cur.runs}</b><span>Läufe diese Woche · Ø {fmtNum(k.avg4.runs, 1)}</span></div>
      <div class="kpi"><b>{k.cur.tabata}</b><span>Tabata-Einheiten diese Woche · Ø {fmtNum(k.avg4.tabata, 1)}</span></div>
      <div class="kpi"><b>{data.total}</b><span>Aktivitäten insgesamt</span></div>
    </section>

    <section class="panel">
      <div class="row">
        <h2 class="month">{monthLabel}</h2>
        <nav class="tabs" aria-label="Monat wählen">
          {#if data.hasPrev}<a href="?monat={data.prevMonth}" data-sveltekit-noscroll aria-label="Vorheriger Monat">‹ Zurück</a>{/if}
          {#if !data.isCurrent}<a href="?" data-sveltekit-noscroll>Heute</a>{/if}
          {#if !data.isCurrent}<a href="?monat={data.nextMonth}" data-sveltekit-noscroll aria-label="Nächster Monat">Weiter ›</a>{/if}
        </nav>
      </div>

      <div class="cal" role="grid" aria-label="Aktivitäten im {monthLabel}">
        <div class="head" role="row">
          {#each WD as d}<div role="columnheader">{d}</div>{/each}
          <div role="columnheader" class="sumhead">Woche</div>
        </div>
        {#each data.weeks as w}
          <div class="week" role="row">
            {#each w.days as d}
              <div class="day" class:out={!d.inMonth} class:today={d.today} role="gridcell">
                <span class="date">{Number(d.date.slice(8))}</span>
                {#each d.acts as a}
                  <a class="act {a.type}" href={href(a)} title={tip(a)}>
                    <span class="ico"><ActivityIcon type={a.type} /></span>
                    <span class="txt"><span class="name">{title(a)}</span><span class="meta">{detail(a)}</span></span>
                  </a>
                {/each}
              </div>
            {/each}
            <div class="sum" role="gridcell">
              {#if w.runs || w.tabata}
                {#if w.runs}<b>{fmtNum(w.km, 1)} km</b><span>{w.runs} {w.runs === 1 ? 'Lauf' : 'Läufe'}</span>{/if}
                {#if w.tabata}<span>{w.tabata} Tabata</span>{/if}
              {:else}<span class="muted">–</span>{/if}
            </div>
          </div>
        {/each}
      </div>
      <div class="legend small muted">
        <span><span class="dot run"></span>Lauf</span><span><span class="dot tabata"></span>Tabata / Kraft</span><span>Klick öffnet die Aktivität</span>
      </div>
    </section>
  {/if}
</main>

<style>
  .month { font-size: 20px; text-transform: capitalize; }
  .cal { display: grid; gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .head, .week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)) 96px; gap: 1px; }
  .head > div { background: var(--panel); padding: 6px 8px; font: 600 11px var(--mono); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .day { background: var(--panel); min-height: 92px; padding: 6px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .day.out { background: var(--bg); }
  .day.out .date { color: var(--muted); opacity: .6; }
  .date { font: 600 12px var(--mono); color: var(--muted); }
  .day.today .date { color: var(--panel); background: var(--accent); border-radius: 999px; padding: 0 7px; align-self: flex-start; }
  .act { display: flex; gap: 6px; align-items: flex-start; padding: 4px 6px; border-radius: 6px; text-decoration: none; color: var(--fg); min-width: 0; border-left: 3px solid; }
  .act.run { background: color-mix(in srgb, var(--accent) 12%, transparent); border-color: var(--accent); }
  .act.tabata { background: color-mix(in srgb, var(--accent-2) 12%, transparent); border-color: var(--accent-2); }
  .act:hover { text-decoration: none; filter: brightness(0.96); }
  .act:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .ico { flex: none; margin-top: 1px; }
  .act.run .ico { color: var(--accent); } .act.tabata .ico { color: var(--accent-2); }
  .txt { display: grid; min-width: 0; line-height: 1.25; }
  .name { font-size: 12px; font-weight: 600; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  .meta { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sum { background: var(--panel); padding: 8px; display: flex; flex-direction: column; justify-content: center; gap: 2px; font-size: 12px; font-variant-numeric: tabular-nums; }
  .sumhead { text-align: left; }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  .dot.run { background: var(--accent); } .dot.tabata { background: var(--accent-2); }
</style>
