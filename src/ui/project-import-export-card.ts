import type { ProjectViewModel } from '../app/selectors/project';
import type { PlannerStore } from '../core/types';
import { button, card, el, inputField } from './dom';

export function renderImportExportCard(viewModel: ProjectViewModel, store: PlannerStore): HTMLElement {
  const fileInput = el('input', { type: 'file', className: 'hidden-file-input' });
  fileInput.accept = '.json,application/json';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      store.commands.importProjectText(text);
    } catch (error) {
      store.commands.setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not import the selected file.',
      });
    }
  });

  return card(
    'Import / export',
    el(
      'div',
      { className: 'toolbar-row' },
      button('Import JSON file', { className: 'primary-button', onClick: () => fileInput.click() }),
      button('Copy current project JSON', {
        className: 'ghost-button',
        onClick: async () => {
          await navigator.clipboard.writeText(store.exportProject());
          store.commands.setBanner({ tone: 'success', message: 'Current project JSON copied.' });
        },
      }),
      button('Download JSON', {
        className: 'ghost-button',
        onClick: () => {
          const blob = new Blob([store.exportProject()], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'difficulty-engine.project.json';
          link.click();
          URL.revokeObjectURL(url);
        },
      }),
      button('New empty project', {
        className: 'ghost-button danger-button',
        onClick: () => store.commands.resetProject(),
      }),
    ),
    fileInput,
    inputField(
      'Project JSON',
      (() => {
        const area = el('textarea', {
          className: 'text-area json-area',
          value: viewModel.importExportText,
          focusKey: 'project:json',
          onInput: (event) => store.commands.setImportExportText((event.target as HTMLTextAreaElement).value),
        });
        area.rows = 16;
        return area;
      })(),
      'Project exports include source masks, but never local qBittorrent credentials.',
    ),
    el('div', {
      className: 'muted-copy',
      text: viewModel.importExportDirty
        ? 'Editor draft differs from the current project. Load it to replace the live state.'
        : 'Editor is synchronized with the live project state.',
    }),
    el('div', {
      className: viewModel.exportedCredentialFree ? 'muted-copy' : 'warning-item warning-fail',
      text: viewModel.exportedCredentialFree
        ? 'qBittorrent connection details are local-only; the password is not saved in the project JSON or persisted local settings.'
        : 'Credential text appears in the JSON editor. Do not export until this is fixed.',
    }),
    button('Load JSON from editor', {
      className: 'primary-button',
      onClick: () => {
        try {
          store.commands.importProjectText(viewModel.importExportText);
        } catch (error) {
          store.commands.setBanner({
            tone: 'error',
            message: error instanceof Error ? error.message : 'Could not parse JSON from the editor.',
          });
        }
      },
    }),
  );
}
