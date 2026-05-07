import type { BookInspectorViewModel } from '../app/selectors/plan-inspector';
import type { PlannerStore, WarningItem } from '../core/types';
import { badge, button, card, el, emptyState } from './dom';
import { formatOneDecimal, formatPages, round0 } from './format';
import { renderProgressBar } from './progress';

export function renderWarningCenter(
  warnings: WarningItem[],
  hiddenWarningCount: number,
  store: PlannerStore,
): HTMLElement {
  if (!warnings.length) {
    return card(
      'Plan health',
      emptyState(
        'No visible warnings',
        hiddenWarningCount
          ? `${hiddenWarningCount} warning type(s) are dismissed for this project.`
          : 'The current plan is internally consistent.',
      ),
      hiddenWarningCount
        ? button('Restore dismissed warnings', {
            className: 'ghost-button',
            onClick: () => store.commands.restoreDismissedWarnings(),
          })
        : null,
    );
  }

  return card(
    'Plan health',
    hiddenWarningCount
      ? el('div', {
          className: 'muted-copy',
          text: `${hiddenWarningCount} non-blocking warning(s) hidden.`,
        })
      : null,
    el(
      'div',
      { className: 'warning-list planner-warning-list' },
      ...warnings.map((warning) =>
        el(
          'div',
          { className: `warning-item warning-${warning.severity}` },
          badge(
            warning.severity === 'fail' ? 'blocking' : warning.severity,
            warning.severity === 'fail'
              ? 'danger'
              : warning.severity === 'warn'
                ? 'warn'
                : 'neutral',
          ),
          el(
            'div',
            { className: 'stack-layout warning-copy' },
            el('strong', { text: warning.message }),
            warning.relatedIds?.length
              ? el('div', {
                  className: 'muted-copy',
                  text: `${warning.relatedIds.length} affected item(s)`,
                })
              : null,
          ),
          warning.severity === 'fail'
            ? null
            : button('Dismiss type', {
                className: 'ghost-button compact-button',
                onClick: () => store.commands.dismissWarningCode(warning.code),
              }),
        ),
      ),
    ),
  );
}

export function renderBookInspector(
  model: BookInspectorViewModel,
  timelineLabel: (slot: number) => string,
  store: PlannerStore,
): HTMLElement {
  if (!model.fallbackId) {
    return card(
      'Selected book',
      emptyState(
        'No book selected',
        'Select a Gantt row or calendar item to inspect it here.',
      ),
    );
  }

  if (!model.schedule || !model.dayStats || !model.difficulty) {
    return card(
      'Selected book',
      emptyState(
        'Book unavailable',
        'The selected book no longer exists in the active plan.',
      ),
    );
  }

  return card(
    'Selected book',
    el(
      'div',
      { className: 'stack-layout compact-stack' },
      el(
        'div',
        { className: 'toolbar-row inspector-toolbar' },
        button('Close details', {
          className: 'ghost-button compact-button',
          onClick: () => store.commands.selectBook(null),
        }),
      ),
      el('div', { className: 'eyebrow', text: model.displayGroup }),
      el('h3', { className: 'inspector-title', text: model.bookTitle }),
      el('div', {
        className: 'muted-copy',
        text: `${formatPages(model.pages)} pages · ${formatOneDecimal(model.difficulty.scheduleDifficulty)} schedule difficulty · ${formatOneDecimal(model.difficulty.latentWorkload)} latent workload`,
      }),
      model.progress ? renderProgressBar(model.progress) : null,
      el(
        'div',
        { className: 'badge-row' },
        badge(`Lane ${model.schedule.lane + 1}`),
        badge(`Start ${timelineLabel(model.schedule.ds)}`),
        badge(`Finish ${timelineLabel(model.schedule.de)}`),
        model.dayStats.floorRelaxed
          ? badge(
              `Floor ${formatOneDecimal(model.dayStats.effectiveMinPg)}/${formatOneDecimal(model.dayStats.strictMinPg)}`,
              'warn',
            )
          : null,
        model.dayStats.backfilled ? badge('Backfilled', 'success') : null,
        model.dayStats.prereqOverlapUsed
          ? badge('Prereq overlap', 'warn')
          : null,
      ),
      el(
        'div',
        { className: 'inspector-metric-grid' },
        el(
          'div',
          { className: 'inspector-metric' },
          el('strong', { text: round0(model.dayStats.usedDays) }),
          el('span', { className: 'muted-copy', text: 'Study days' }),
        ),
        el(
          'div',
          { className: 'inspector-metric' },
          el('strong', { text: round0(model.dayStats.minutes / 60) }),
          el('span', { className: 'muted-copy', text: 'Hours planned' }),
        ),
        el(
          'div',
          { className: 'inspector-metric' },
          el('strong', { text: formatOneDecimal(model.dayStats.dayPages) }),
          el('span', { className: 'muted-copy', text: 'Pages / day' }),
        ),
        el(
          'div',
          { className: 'inspector-metric' },
          el('strong', {
            text: formatOneDecimal(model.schedule.desiredPagesPerDay),
          }),
          el('span', { className: 'muted-copy', text: 'Desired pages/day' }),
        ),
        el(
          'div',
          { className: 'inspector-metric' },
          el('strong', {
            text: `${model.incoming.length}/${model.outgoing.length}`,
          }),
          el('span', { className: 'muted-copy', text: 'In / out relations' }),
        ),
      ),
      el('div', {
        className: 'muted-copy',
        text: `Final ${formatOneDecimal(model.schedule.finalPagesPerDay)} pg/day · feasible ${formatOneDecimal(model.schedule.feasibleMinPagesPerDay)}-${formatOneDecimal(model.schedule.feasibleMaxPagesPerDay)} · binding ${model.schedule.pacingBindingReason}`,
      }),
      el(
        'div',
        { className: 'stack-list compact-stack' },
        ...model.explanation.map((line) =>
          el('div', { className: 'stack-row', text: line }),
        ),
      ),
      el(
        'div',
        { className: 'stack-layout compact-stack' },
        el('strong', { text: 'Immediate relations' }),
        model.incoming.length || model.outgoing.length
          ? el(
              'div',
              { className: 'badge-row' },
              ...model.incoming
                .slice(0, 4)
                .map((relation) =>
                  badge(`${relation.from} -> ${relation.type}`),
                ),
              ...model.outgoing
                .slice(0, 4)
                .map((relation) => badge(`${relation.type} -> ${relation.to}`)),
            )
          : el('div', {
              className: 'muted-copy',
              text: 'No immediate relations.',
            }),
      ),
    ),
  );
}
