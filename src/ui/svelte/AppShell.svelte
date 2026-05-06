<script>
  import { selectShellViewModel } from '../../app/selectors/shell';
  import { renderActiveTabBody } from '../active-tab-host';

  let { appState, store } = $props();

  let workspace;

  const viewModel = $derived(selectShellViewModel($appState));

  $effect(() => {
    if (workspace) {
      renderActiveTabBody(workspace, $appState, store);
    }
  });
</script>

<div class="app-shell" data-active-view={viewModel.activeView}>
  <header class="app-header" data-shell-slot="header">
    <div class="app-header-main">
      <div class="eyebrow">Difficulty Engine</div>
      <h1>Study Planner</h1>
      <p class="muted-copy">{viewModel.activeDescription}</p>
    </div>
    <div class="app-header-side">
      {#each viewModel.stats as item (item.label)}
        <div class="header-stat">
          <strong>{item.value}</strong>
          <span class="muted-copy">{item.label}</span>
        </div>
      {/each}
    </div>
  </header>

  <div class="tab-strip-wrap" data-shell-slot="tabs">
    <nav class="tab-strip" aria-label="Planner sections">
      {#each viewModel.tabs as view (view.id)}
        <button
          type="button"
          class:active={view.active}
          class="tab-button"
          onclick={() => store.commands.setActiveView(view.id)}
        >
          {view.label}
        </button>
      {/each}
    </nav>
    <div class="toolbar-row app-toolbar">
      <button
        type="button"
        class="primary-button"
        onclick={() => store.commands.addBook()}
      >
        Add book
      </button>
      <button
        type="button"
        class="ghost-button"
        onclick={() => store.commands.setActiveView('library')}
      >
        Open library
      </button>
      <button
        type="button"
        class="ghost-button"
        onclick={() => store.commands.setActiveView('project')}
      >
        Project
      </button>
    </div>
  </div>

  {#if viewModel.banner}
    <div
      class={`banner banner-${viewModel.banner.tone}`}
      data-shell-slot="banner"
    >
      {viewModel.banner.message}
    </div>
  {/if}

  <main
    bind:this={workspace}
    class="main-content workspace-content"
    data-shell-slot="body"
  ></main>
</div>
