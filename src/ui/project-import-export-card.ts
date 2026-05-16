import type { ProjectViewModel } from '../app/selectors/project';
import type { PlannerStore } from '../core/types';
import { runConfirmableAction } from './confirmable-action';
import { button, card, el } from './dom';
import {
  checkboxControl,
  fileInputControl,
  inputField,
  textAreaControl,
} from './form-controls';
import {
  getPendingBooleanOption,
  setPendingBooleanOption,
} from './pending-action-options';

const CLEAR_PROJECT_DELETE_CONTENT_OPTION = 'metadata.clearProject.deleteContent';

export function renderImportExportCard(
  viewModel: ProjectViewModel,
  store: PlannerStore,
): HTMLElement {
  const fileInput = fileInputControl({
    className: 'hidden-file-input',
    accept: '.json,application/json',
    onChange: async (file) => {
      if (!file) return;
      const text = await file.text();
      try {
        store.commands.importProjectText(text);
      } catch (error) {
        store.commands.setBanner({
          tone: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Could not import the selected file.',
        });
      }
    },
  });

  return card(
    'Import / export',
    el(
      'div',
      { className: 'toolbar-row' },
      button('Import JSON file', {
        className: 'primary-button',
        onClick: () => fileInput.click(),
      }),
      button('Copy current project JSON', {
        className: 'ghost-button',
        onClick: async () => {
          await navigator.clipboard.writeText(store.exportProject());
          store.commands.setBanner({
            tone: 'success',
            message: 'Current project JSON copied.',
          });
        },
      }),
      button('Download JSON', {
        className: 'ghost-button',
        onClick: () => {
          const blob = new Blob([store.exportProject()], {
            type: 'application/json',
          });
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
        onClick: () =>
          runConfirmableAction(store, {
            id: 'project.reset',
            message:
              'Click New empty project again to confirm replacing the current reading list.',
            action: () => store.commands.resetProject(),
          }),
      }),
    ),
    fileInput,
    inputField(
      'Project JSON',
      textAreaControl({
        className: 'text-area json-area',
        value: viewModel.importExportText,
        focusKey: 'project:json',
        rows: 16,
        onInput: (value) => store.commands.setImportExportText(value),
      }),
      'Project exports include source masks, but never local qBittorrent credentials.',
    ),
    el('div', {
      className: 'muted-copy',
      text: viewModel.importExportDirty
        ? 'Editor draft differs from the current project. Load it to replace the live state.'
        : 'Editor is synchronized with the live project state.',
    }),
    el('div', {
      className: viewModel.exportedCredentialFree
        ? 'muted-copy'
        : 'warning-item warning-fail',
      text: viewModel.exportedCredentialFree
        ? 'qBittorrent connection details are local-only; the password is not saved in the project JSON or persisted local settings.'
        : 'Credential text appears in the JSON editor. Do not export until this is fixed.',
    }),
    button('Load JSON from editor', {
      className: 'primary-button',
      onClick: () => {
        try {
          store.commands.importProjectText(
            store.selectors.getState().ui.importExportText,
          );
        } catch (error) {
          store.commands.setBanner({
            tone: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Could not parse JSON from the editor.',
          });
        }
      },
    }),
    el('hr', { className: 'section-divider' }),
    el('h3', { text: 'Backups' }),
    el(
      'label',
      { className: 'inline-control muted-copy' },
      checkboxControl({
        checked: store.selectors.getProject().uiPreferences.backupsEnabled,
        onChange: (checked) =>
          store.commands.setProjectBackupsEnabled(checked),
      }),
      el('span', {
        text:
          'Save backups before project overwrites. The local bridge also writes JSON snapshots to output/backups when available.',
      }),
    ),
    el('hr', { className: 'section-divider' }),
    el('h3', { text: 'Project metadata maintenance' }),
    el('p', {
      className: 'muted-copy',
      text:
        'Clears enrichment, TOC, provider IDs, qBittorrent candidates, greylist entries, and document refs for every book. Stalled or 0-progress qBittorrent transfers are removed automatically; reading progress and manual planning choices are preserved.',
    }),
    el(
      'label',
      { className: 'inline-control muted-copy' },
      checkboxControl({
        checked: getPendingBooleanOption(
          store,
          CLEAR_PROJECT_DELETE_CONTENT_OPTION,
        ),
        onChange: (checked) => {
          setPendingBooleanOption(
            store,
            CLEAR_PROJECT_DELETE_CONTENT_OPTION,
            checked,
          );
        },
      }),
      el('span', {
        text: 'Also delete active/completed downloaded PDFs/content',
      }),
    ),
    button('Delete all metadata', {
      className: 'ghost-button danger-button',
      onClick: () =>
        runConfirmableAction(store, {
          id: 'metadata.clearProject',
          message:
            'Click Delete all metadata again to confirm clearing enrichment/document metadata for every book.',
          action: () =>
            void store.commands.clearProjectMetadata({
              deleteContent: getPendingBooleanOption(
                store,
                CLEAR_PROJECT_DELETE_CONTENT_OPTION,
              ),
            }),
        }),
    }),
  );
}
