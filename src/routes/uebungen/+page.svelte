<script>
  import { enhance } from '$app/forms';
  let { data, form } = $props();
  const mapped = $derived(data.rows.filter((r) => r.notion_page_id || r.label).length);
</script>

<main class="page">
  <div class="row">
    <h1>Übungen zuordnen</h1>
    <span class="muted small">{mapped} von {data.rows.length} Garmin-Übungen zugeordnet</span>
  </div>
  <p class="muted" style="max-width:70ch">Die Uhr speichert jede Übung unter einem Garmin-Namen, der oft nur ungefähr passt. Ordne sie hier einmal deiner Notion-Übung zu
    oder gib ihr einen eigenen Namen. Danach erscheinen überall in der App deine Namen.</p>

  {#if !data.notion.length}
    <div class="empty">Noch keine Notion-Übungen geladen. Trage den Key in <code>.env</code> ein und starte <code>npm run sync:notion</code>. Eigene Namen kannst du schon jetzt vergeben.</div>
  {/if}

  <form method="POST" action="?/save" class="panel" use:enhance={() => async ({ update }) => update({ reset: false })}>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Garmin-Übung</th><th class="num">Einheiten</th><th class="num">Ø Wdh.</th><th>Zuletzt</th><th>Notion-Übung</th><th>Eigener Name</th></tr></thead>
        <tbody>
          {#each data.rows as r}
            <tr>
              <td>{r.garminLabel}<br /><span class="muted small">{r.category}</span><input type="hidden" name="exercise" value={r.exercise} /></td>
              <td class="num">{r.sessions}</td>
              <td class="num">{r.avg_reps ?? '–'}</td>
              <td class="small">{r.last}</td>
              <td>
                <select id="notion-{r.exercise}" name="notion:{r.exercise}" value={r.notion_page_id ?? ''} disabled={!data.notion.length}>
                  <option value="">–</option>
                  {#each data.notion as n}<option value={n.id}>{n.title}</option>{/each}
                </select>
              </td>
              <td><input type="text" id="label-{r.exercise}" name="label:{r.exercise}" value={r.label ?? ''} placeholder={r.garminLabel} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="row">
      <span class="small">{#if form?.saved}<span class="delta-good">Gespeichert.</span>{/if}</span>
      <button class="btn">Zuordnung speichern</button>
    </div>
  </form>
</main>
