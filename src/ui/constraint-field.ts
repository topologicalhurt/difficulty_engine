import { horizonMonthsFromEndDate, targetEndDateKey } from '../core/planning-window';
import type { ConstraintField, ConstraintSet, PlannerStore } from '../core/types';
import { el, inputField, selectInput } from './dom';
import {
  deferConstraintUpdate,
  deferConstraintsUpdate,
  isCompleteDateInput,
  selectConstraintField,
} from './constraint-field-updates';

const WEEKDAY_OPTIONS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

function renderBooleanField(
  field: ConstraintField,
  value: ConstraintSet[keyof ConstraintSet],
  store: PlannerStore,
): HTMLElement {
  return inputField(
    field.label,
    el('input', {
      className: 'checkbox-input',
      type: 'checkbox',
      checked: Boolean(value),
      onFocus: () => selectConstraintField(store, field),
      onClick: () => selectConstraintField(store, field),
      onChange: (event) =>
        deferConstraintUpdate(
          store,
          field.key,
          (event.target as HTMLInputElement).checked as ConstraintSet[typeof field.key],
        ),
    }),
    field.description,
  );
}

function renderDateField(
  field: ConstraintField,
  value: ConstraintSet[keyof ConstraintSet],
  store: PlannerStore,
): HTMLElement {
  const commitDate = (event: Event): void => {
    const next = (event.target as HTMLInputElement).value;
    if (!isCompleteDateInput(next)) return;
    deferConstraintUpdate(store, field.key, next as ConstraintSet[typeof field.key]);
  };
  return inputField(
    field.label,
    el('input', {
      className: 'text-input',
      type: 'date',
      value: String(value),
      focusKey: `constraint:${String(field.key)}`,
      onFocus: () => selectConstraintField(store, field),
      onInput: commitDate,
      onChange: commitDate,
    }),
    field.description,
  );
}

function renderTargetDateField(
  field: ConstraintField,
  constraints: ConstraintSet,
  store: PlannerStore,
): HTMLElement {
  const value = constraints[field.key];
  const commitEndDate = (event: Event): void => {
    const next = (event.target as HTMLInputElement).value;
    if (!isCompleteDateInput(next)) return;
    deferConstraintUpdate(
      store,
      field.key,
      horizonMonthsFromEndDate(constraints.sd, next) as ConstraintSet[typeof field.key],
    );
  };
  return inputField(
    field.label,
    el('input', {
      className: 'text-input',
      type: 'date',
      value: targetEndDateKey(constraints.sd, Number(value)),
      focusKey: `constraint:${String(field.key)}`,
      onFocus: () => selectConstraintField(store, field),
      onInput: commitEndDate,
      onChange: commitEndDate,
    }),
    field.description,
  );
}

function renderSelectField(
  field: ConstraintField,
  value: ConstraintSet[keyof ConstraintSet],
  store: PlannerStore,
): HTMLElement {
  const select = selectInput(
    String(value),
    field.options ?? [],
    {
      className: 'select-input',
      focusKey: `constraint:${String(field.key)}`,
      onFocus: () => selectConstraintField(store, field),
      onChange: (event) => {
        selectConstraintField(store, field);
        deferConstraintUpdate(
          store,
          field.key,
          (event.target as HTMLSelectElement).value as ConstraintSet[typeof field.key],
        );
      },
    },
  );
  return inputField(field.label, select, field.description);
}

function renderWeekdaySetField(
  field: ConstraintField,
  constraints: ConstraintSet,
  store: PlannerStore,
): HTMLElement {
  const active = new Set(constraints.studyWeekdays);
  return inputField(
    field.label,
    el(
      'div',
      { className: 'weekday-picker' },
      ...WEEKDAY_OPTIONS.map((day) =>
        el(
          'label',
          { className: `weekday-chip${active.has(day.value) ? ' active' : ''}` },
          el('input', {
            type: 'checkbox',
            checked: active.has(day.value),
            onFocus: () => selectConstraintField(store, field),
            onChange: (event) => {
              selectConstraintField(store, field);
              const next = new Set(constraints.studyWeekdays);
              if ((event.target as HTMLInputElement).checked) next.add(day.value);
              else next.delete(day.value);
              const studyWeekdays = [...next].sort((left, right) => left - right);
              deferConstraintsUpdate(
                store,
                {
                  studyWeekdays,
                  weekdaysCustom: true,
                  dpw: Math.max(1, studyWeekdays.length),
                },
                'studyWeekdays',
              );
            },
          }),
          el('span', { text: day.label }),
        ),
      ),
    ),
    field.description,
  );
}

function renderNumberField(
  field: ConstraintField,
  value: ConstraintSet[keyof ConstraintSet],
  store: PlannerStore,
): HTMLElement {
  const input = el('input', {
    className: 'text-input',
    type: 'number',
    value: String(value),
    focusKey: `constraint:${String(field.key)}`,
    onFocus: () => selectConstraintField(store, field),
    onChange: (event) =>
      deferConstraintUpdate(
        store,
        field.key,
        Number((event.target as HTMLInputElement).value) as ConstraintSet[typeof field.key],
      ),
  });
  if (field.min != null) input.min = String(field.min);
  if (field.max != null) input.max = String(field.max);
  if (field.step != null) input.step = String(field.step);
  return inputField(field.label, input, field.description);
}

export function renderConstraintField(
  field: ConstraintField,
  constraints: ConstraintSet,
  store: PlannerStore,
): HTMLElement {
  const value = constraints[field.key];
  if (field.kind === 'boolean') return renderBooleanField(field, value, store);
  if (field.kind === 'date') return renderDateField(field, value, store);
  if (field.kind === 'target-date') return renderTargetDateField(field, constraints, store);
  if (field.kind === 'select' && field.options) return renderSelectField(field, value, store);
  if (field.kind === 'weekday-set') return renderWeekdaySetField(field, constraints, store);
  return renderNumberField(field, value, store);
}
