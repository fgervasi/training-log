<script>
  import '../app.css';
  import { page } from '$app/state';
  let { children } = $props();
  const nav = [
    ['/', 'Übersicht'],
    ['/laeufe', 'Läufe'],
    ['/tabata', 'Tabata'],
    ['/uebungen', 'Übungen']
  ];
  const active = (href) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<svelte:head><title>Training Log</title></svelte:head>

<header>
  <div class="bar">
    <a class="brand" href="/">Training Log</a>
    <nav class="tabs">
      {#each nav as [href, label]}
        <a {href} class:on={active(href)}>{label}</a>
      {/each}
    </nav>
  </div>
</header>
{@render children()}

<style>
  header { background: var(--panel); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 5; }
  .bar { max-width: 1180px; margin: 0 auto; padding: 10px 20px; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .brand { font-weight: 750; color: var(--fg); letter-spacing: -.01em; }
</style>
