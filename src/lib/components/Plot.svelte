<script>
  // Observable Plot als Svelte-Komponente. `make(width)` liefert die Plot-Optionen.
  // `onhover` bekommt bei Plot.pointer den aktuellen Datensatz (oder null).
  import * as Plot from '@observablehq/plot';
  let { make, onhover = null, height = 260 } = $props();
  let el = $state();
  let width = $state(600);

  $effect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => (width = Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  });

  $effect(() => {
    if (!el) return;
    const chart = Plot.plot({ width, height, style: { background: 'transparent', color: 'var(--fg)', fontSize: '12px' }, ...make(width, Plot) });
    if (onhover) chart.addEventListener('input', () => onhover(chart.value ?? null));
    el.replaceChildren(chart);
    return () => chart.remove();
  });
</script>

<div class="plot" bind:this={el}></div>

<style>
  .plot { width: 100%; min-width: 0; }
  .plot :global(figure) { margin: 0; }
  .plot :global(h2) { font-size: 13px; }
</style>
