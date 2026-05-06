import type {
  ProjectViewModel,
  ProjectSourceProviderRow,
} from '../app/selectors/project';
import type { PlannerStore, SourceSettings } from '../core/types';
import { card, el } from './dom';
import { sourceCheckbox } from './project-view-controls';

function sourceProviderPatch(
  row: ProjectSourceProviderRow,
  sourceSettings: SourceSettings,
  checked: boolean,
): Partial<SourceSettings> {
  return row.kind === 'metadata'
    ? {
        metadataSources: {
          ...sourceSettings.metadataSources,
          [row.key]: checked,
        },
      }
    : {
        documentSources: {
          ...sourceSettings.documentSources,
          [row.key]: checked,
        },
      };
}

export function renderSourceProvidersCard(
  viewModel: ProjectViewModel,
  store: PlannerStore,
): HTMLElement {
  const sourceSettings = viewModel.sourceSettings;
  const update = (patch: Partial<SourceSettings>): void =>
    store.commands.updateSourceSettings(patch);
  return card(
    'Source providers',
    el('p', {
      className: 'muted-copy',
      text: 'Choose which platforms can contribute search results, metadata, subjects, descriptions, table-of-contents data, and source documents.',
    }),
    el(
      'div',
      { className: 'settings-grid' },
      ...viewModel.sourceProviders.map((row) =>
        sourceCheckbox(row.checked, row.label, row.detail, (checked) =>
          update(sourceProviderPatch(row, sourceSettings, checked)),
        ),
      ),
    ),
    el('div', {
      className: 'muted-copy',
      text: `Content preference: ${viewModel.contentPreferenceLabel}. Plain text is preferred, OCR-derived text is labeled, and PDF is last.`,
    }),
  );
}
