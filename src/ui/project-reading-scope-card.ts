import type { ProjectViewModel } from '../app/selectors/project';
import type { PlannerStore, ReadingSectionKind } from '../core/types';
import { card, el } from './dom';
import { inputField, selectInput } from './form-controls';

const SKIP_KIND_LABELS: Record<ReadingSectionKind, string> = {
  core: 'Core chapters',
  front_matter: 'Front matter',
  toc: 'TOC pages',
  appendix: 'Appendices',
  bibliography_index: 'Bibliography/index',
  solutions_reference: 'Solutions/reference',
  redundant_duplicate: 'Duplicate sections',
  unknown: 'Unknown sections',
};

export function renderProjectReadingScopeCard(
  model: ProjectViewModel,
  store: PlannerStore,
): HTMLElement {
  const settings = model.readingScopeSettings;
  return card(
    'Reading scope defaults',
    inputField(
      'Default learned-section behavior',
      selectInput(
        settings.defaultMode,
        [
          { value: 'skip_non_core', label: 'Skip learned non-core sections' },
          { value: 'include_all', label: 'Include every learned section' },
        ],
        {
          onChange: (event) => {
            if (event.target instanceof HTMLSelectElement) {
              store.commands.updateReadingScopeSettings({
                defaultMode: event.target.value as 'skip_non_core' | 'include_all',
              });
            }
          },
        },
      ),
      'Applies to books whose reading scope is set to project default.',
    ),
    el(
      'div',
      { className: 'badge-row' },
      ...settings.skipKinds.map((kind) =>
        el('span', { className: 'badge', text: SKIP_KIND_LABELS[kind] ?? kind }),
      ),
    ),
  );
}
