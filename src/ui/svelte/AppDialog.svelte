<script>
  import { runRegisteredDialogAction } from '../dialog-actions';

  let { dialog, store } = $props();

  function actionClass(action) {
    if (action.tone === 'danger') return 'danger-button';
    if (action.tone === 'secondary') return 'ghost-button';
    return 'primary-button';
  }
</script>

{#if dialog}
  <div class="dialog-overlay" role="presentation">
    <div
      class={`dialog-card dialog-${dialog.tone ?? 'info'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`dialog-title-${dialog.id}`}
      tabindex="-1"
    >
      <div class="dialog-eyebrow">Decision needed</div>
      <h2 id={`dialog-title-${dialog.id}`}>{dialog.title}</h2>
      <p>{dialog.body}</p>
      {#if dialog.detail}
        <p class="muted-copy">{dialog.detail}</p>
      {/if}
      <div class="toolbar-row dialog-actions">
        {#each dialog.actions as action (action.id)}
          <button
            type="button"
            class={actionClass(action)}
            onclick={() => runRegisteredDialogAction(store, dialog.id, action.id)}
          >
            {action.label}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
