<script>
  import { runRegisteredDialogAction } from '../dialog-actions';

  let { dialog, store } = $props();
  let card = $state(null);

  function actionClass(action) {
    if (action.tone === 'danger') return 'danger-button';
    if (action.tone === 'secondary') return 'ghost-button';
    return 'primary-button';
  }

  // The action Escape should route to: an explicit cancel/close, else the
  // first secondary (non-committing) action. Returns null when the dialog has
  // no safe dismissal, so a required decision is not force-closed.
  function dismissActionId() {
    const actions = dialog?.actions ?? [];
    const ids = actions.map((action) => action.id);
    if (ids.includes('cancel')) return 'cancel';
    if (ids.includes('close')) return 'close';
    return actions.find((action) => action.tone === 'secondary')?.id ?? null;
  }

  function onKeydown(event) {
    if (event.key !== 'Escape' || !dialog) return;
    const id = dismissActionId();
    if (!id) return;
    event.preventDefault();
    runRegisteredDialogAction(store, dialog.id, id);
  }

  // Move focus into the dialog when it opens so keyboard/screen-reader users
  // land on the modal (aria-modal) rather than the background content.
  $effect(() => {
    if (dialog && card) card.focus();
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#if dialog}
  <div class="dialog-overlay" role="presentation">
    <div
      bind:this={card}
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
