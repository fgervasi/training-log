<script>
  // Karte mit swisstopo-Vektorkarten (frei nutzbar, Quelle angeben) und MapLibre.
  import { onMount } from 'svelte';
  import 'maplibre-gl/dist/maplibre-gl.css';

  /** tracks: [{ id, color, coords: [[lon, lat], ...] }], marker: [lon, lat] | null */
  let { tracks = [], marker = null, height = 420 } = $props();
  const STYLES = {
    hell: 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json',
    karte: 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json'
  };
  let style = $state('hell');
  let el = $state();
  let map, markerObj, maplibre;
  let ready = $state(false);

  function drawTracks() {
    if (!map || !ready) return;
    for (const t of tracks) {
      const src = `track-${t.id}`;
      const data = { type: 'Feature', geometry: { type: 'LineString', coordinates: t.coords } };
      if (map.getSource(src)) map.getSource(src).setData(data);
      else {
        map.addSource(src, { type: 'geojson', data });
        map.addLayer({ id: src + '-casing', type: 'line', source: src, paint: { 'line-color': '#fff', 'line-width': 7, 'line-opacity': 0.8 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
        map.addLayer({ id: src, type: 'line', source: src, paint: { 'line-color': t.color, 'line-width': 4 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
      }
    }
    // Spuren entfernen, die nicht mehr gebraucht werden
    for (const l of map.getStyle().layers) {
      const m = l.id.match(/^track-(.+?)(-casing)?$/);
      if (m && !tracks.some((t) => String(t.id) === m[1])) map.removeLayer(l.id);
    }
    for (const id of Object.keys(map.getStyle().sources)) {
      const m = id.match(/^track-(.+)$/);
      if (m && !tracks.some((t) => String(t.id) === m[1])) map.removeSource(id);
    }
  }

  function fit() {
    const all = tracks.flatMap((t) => t.coords);
    if (!all.length) return;
    const b = all.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [180, 90, -180, -90]);
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, duration: 0 });
  }

  onMount(async () => {
    maplibre = (await import('maplibre-gl')).default;
    map = new maplibre.Map({ container: el, style: STYLES[style], attributionControl: false });
    map.addControl(new maplibre.AttributionControl({ compact: true, customAttribution: '© swisstopo' }));
    map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
    map.on('style.load', () => { ready = true; drawTracks(); });
    map.once('load', fit);
    return () => map.remove();
  });

  $effect(() => { tracks; drawTracks(); });
  $effect(() => {
    if (!map || !maplibre) return;
    if (!marker) { markerObj?.remove(); markerObj = null; return; }
    if (!markerObj) markerObj = new maplibre.Marker({ color: '#18232b', scale: 0.7 });
    markerObj.setLngLat(marker).addTo(map);
  });
  function setStyle(s) { style = s; ready = false; map.setStyle(STYLES[s]); }
</script>

<div class="wrap" style:height="{height}px">
  <div class="map" bind:this={el}></div>
  <div class="switch tabs">
    <button class:on={style === 'hell'} onclick={() => setStyle('hell')}>Hell</button>
    <button class:on={style === 'karte'} onclick={() => setStyle('karte')}>Karte</button>
  </div>
</div>

<style>
  .wrap { position: relative; border-radius: 8px; overflow: hidden; border: 1px solid var(--line); }
  .map { position: absolute; inset: 0; }
  .switch { position: absolute; left: 10px; top: 10px; }
  .switch button { background: var(--panel); }
  .switch button.on { background: var(--fg); }
</style>
