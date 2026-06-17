import type { CalendarViewModel } from '../app/selectors/calendar';
import { DEFAULT_ACTIVITY_COLOR } from '../core/display-colors';
import type { PlannerStore } from '../core/types';
import { button, el, panel } from './dom';
import {
  checkboxControl,
  numberInputControl,
  selectInput,
  textInputControl,
} from './form-controls';

const CALENDAR_WEEKDAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

function numberFromInput(
  input: HTMLInputElement | null | undefined,
  fallback: number,
): number {
  // An empty/blank field must fall back to the intended default. Number('')
  // is 0 (finite), so without this guard a cleared "Start hour" or per-day
  // hours field would silently become 00:00 / the 15-minute floor instead of
  // the intended default.
  const raw = input?.value?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numericInput(
  container: HTMLElement,
  selector: string,
  fallback: number,
): number {
  return numberFromInput(
    container.querySelector<HTMLInputElement>(selector),
    fallback,
  );
}

function readTextControl(
  container: HTMLElement,
  selector: string,
  fallback: string,
): string {
  return (
    container.querySelector<HTMLInputElement>(selector)?.value.trim() ||
    fallback
  );
}

function selectedActivityDays(container: HTMLElement): number[] {
  const days = [
    ...container.querySelectorAll<HTMLInputElement>('[data-activity-day]'),
  ]
    .filter((input) => input.checked)
    .map((input) => Number(input.value))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 6);
  return days.length ? days : [1, 2, 3, 4, 5];
}

function selectedDailyDurations(
  container: HTMLElement,
): Record<string, number> {
  const selected = new Set(selectedActivityDays(container).map(String));
  return Object.fromEntries(
    [
      ...container.querySelectorAll<HTMLInputElement>(
        '[data-activity-day-hours]',
      ),
    ]
      .filter((input) => selected.has(input.dataset.activityDayHours ?? ''))
      .map((input) => [
        input.dataset.activityDayHours ?? '',
        Math.max(0.25, numberFromInput(input, 2)) * 60,
      ]),
  );
}

function setCheckedDays(container: HTMLElement, days: number[]): void {
  const selected = new Set(days.map(String));
  container
    .querySelectorAll<HTMLInputElement>('[data-activity-day]')
    .forEach((input) => {
      input.checked = selected.has(input.value);
    });
}

function applyRotationVisibility(form: HTMLElement, mode: string): void {
  const hidden = mode === 'flexible_weekly';
  [
    form.querySelector('.calendar-activity-rotation-select'),
    form.querySelector('.calendar-activity-rotation-interval-input'),
  ].forEach((control) => {
    const field = control?.closest('label');
    if (field instanceof HTMLElement) {
      field.style.display = hidden ? 'none' : '';
    }
  });
}

function copyDurationToSelectedDays(container: HTMLElement): void {
  const duration = String(
    numericInput(container, '.calendar-activity-duration-input', 2),
  );
  const selected = new Set(selectedActivityDays(container).map(String));
  container
    .querySelectorAll<HTMLInputElement>('[data-activity-day-hours]')
    .forEach((input) => {
      if (selected.has(input.dataset.activityDayHours ?? '')) {
        input.value = duration;
      }
    });
}

function inertTextInput(options: {
  className: string;
  value: string;
  type?: string;
  placeholder?: string;
}): HTMLInputElement {
  return textInputControl({
    ...options,
    focusKey: `calendar:${options.className}`,
    onInput: () => undefined,
  });
}

function inertNumberInput(options: {
  className: string;
  value: number;
  min: number | string;
  max: number | string;
  step: number | string;
  focusKey?: string;
}): HTMLInputElement {
  return numberInputControl({
    ...options,
    focusKey: options.focusKey ?? `calendar:${options.className}`,
    onChange: () => undefined,
  });
}

function weekdayCheckbox(day: { value: number; label: string }): HTMLElement {
  const checkbox = checkboxControl({
    checked: day.value >= 1 && day.value <= 5,
    onChange: () => undefined,
  });
  checkbox.value = String(day.value);
  checkbox.dataset.activityDay = String(day.value);
  return el(
    'label',
    { className: 'calendar-weekday-option' },
    checkbox,
    el('span', { text: day.label }),
  );
}

function weekdayHoursInput(day: { value: number; label: string }): HTMLElement {
  const input = inertNumberInput({
    className: 'calendar-activity-day-hours-input',
    // Each weekday needs a distinct focus key — they share a className for
    // styling, but a shared focusKey makes restoreFocus (first-match) refocus
    // the wrong day's field after a mid-edit re-render.
    focusKey: `calendar:calendar-activity-day-hours-input:${day.value}`,
    value: 2,
    min: 0.25,
    max: 12,
    step: '0.25',
  });
  input.dataset.activityDayHours = String(day.value);
  return el(
    'label',
    {
      className:
        'calendar-setting-field compact-field calendar-day-hours-field',
    },
    el('span', { text: `${day.label} h` }),
    input,
  );
}

function renderLearningModeControl(
  viewModel: CalendarViewModel,
  store: PlannerStore,
): HTMLElement {
  const select = selectInput(
    viewModel.learningMode,
    [
      { value: 'cognitive_default', label: 'Balanced day (08:00-22:00)' },
      { value: 'morning_focus', label: 'Morning to afternoon (07:00-15:00)' },
      { value: 'afternoon_focus', label: 'Afternoon to evening (12:00-20:00)' },
      { value: 'evening_focus', label: 'Evening to night (17:00-24:00)' },
      { value: 'night_focus', label: 'Night focus (20:00-24:00)' },
    ],
    {
      className: 'calendar-learning-select',
      onChange: (event) => {
        const value = (event.target as HTMLSelectElement).value;
        if (
          value === 'cognitive_default' ||
          value === 'morning_focus' ||
          value === 'afternoon_focus' ||
          value === 'evening_focus' ||
          value === 'night_focus'
        ) {
          store.commands.setCalendarLearningMode(value);
        }
      },
    },
  );
  return el(
    'label',
    { className: 'calendar-setting-field' },
    el('span', { text: 'Learning model' }),
    select,
  );
}

function activitySwatch(color: string): HTMLElement {
  const swatch = el('span', { className: 'calendar-activity-swatch' });
  swatch.style.background = color;
  return swatch;
}

function renderActivityList(
  viewModel: CalendarViewModel,
  store: PlannerStore,
): HTMLElement {
  if (!viewModel.activityRows.length) {
    return el('p', {
      className: 'muted-copy',
      text: 'No activities added yet.',
    });
  }
  return el(
    'div',
    { className: 'calendar-activity-list' },
    ...viewModel.activityRows.map((activity) =>
      el(
        'div',
        { className: 'calendar-activity-row' },
        activitySwatch(activity.color),
        el('span', { text: activity.title }),
        el('span', {
          className: 'muted-copy',
          text: activity.summary,
        }),
        button('Remove', {
          className: 'ghost-button calendar-action-button',
          onClick: () => store.commands.removeCalendarActivity(activity.id),
        }),
      ),
    ),
  );
}

function renderActivityForm(
  viewModel: CalendarViewModel,
  store: PlannerStore,
): HTMLElement {
  const form = el(
    'div',
    { className: 'calendar-activity-form' },
    renderLearningModeControl(viewModel, store),
    el(
      'label',
      { className: 'calendar-setting-field' },
      el('span', { text: 'Activity' }),
      inertTextInput({
        className: 'calendar-activity-title-input',
        placeholder: 'Activity name',
        value: 'Activity',
      }),
    ),
    el(
      'label',
      { className: 'calendar-setting-field compact-field' },
      el('span', { text: 'Color' }),
      inertTextInput({
        type: 'color',
        className: 'calendar-activity-color-input',
        value: DEFAULT_ACTIVITY_COLOR,
      }),
    ),
    el(
      'label',
      { className: 'calendar-setting-field' },
      el('span', { text: 'Pattern' }),
      selectInput(
        'fixed_weekly',
        [
          { value: 'fixed_weekly', label: 'Fixed weekly days' },
          { value: 'flexible_weekly', label: 'Flexible weekly target' },
        ],
        {
          className: 'calendar-activity-mode-select',
          // Rotation only applies to fixed-weekly activities; hide its controls
          // for flexible mode so the UI does not imply a setting that is
          // ignored when placing flexible sessions.
          onChange: (event) => {
            const target = event.target as HTMLSelectElement;
            const formEl = target.closest('.calendar-activity-form');
            if (formEl instanceof HTMLElement) {
              applyRotationVisibility(formEl, target.value);
            }
          },
        },
      ),
    ),
    el(
      'label',
      { className: 'calendar-setting-field' },
      el('span', { text: 'Rotation' }),
      selectInput(
        '0',
        [
          { value: '0', label: 'No rotation' },
          { value: '1', label: 'Rotate +1 day each cycle' },
          { value: '2', label: 'Rotate +2 days each cycle' },
          { value: '3', label: 'Rotate +3 days each cycle' },
        ],
        { className: 'calendar-activity-rotation-select' },
      ),
    ),
    el(
      'div',
      { className: 'calendar-weekday-picker' },
      ...CALENDAR_WEEKDAY_OPTIONS.map(weekdayCheckbox),
    ),
    el(
      'div',
      { className: 'calendar-activity-utility-row' },
      button('Weekdays', {
        className: 'ghost-button calendar-action-button',
        onClick: () => setCheckedDays(form, [1, 2, 3, 4, 5]),
      }),
      button('Weekend', {
        className: 'ghost-button calendar-action-button',
        onClick: () => setCheckedDays(form, [0, 6]),
      }),
      button('All days', {
        className: 'ghost-button calendar-action-button',
        onClick: () => setCheckedDays(form, [0, 1, 2, 3, 4, 5, 6]),
      }),
      button('Even selected hours', {
        className: 'ghost-button calendar-action-button',
        onClick: () => copyDurationToSelectedDays(form),
      }),
    ),
    el(
      'label',
      { className: 'calendar-setting-field compact-field' },
      el('span', { text: 'Start hour' }),
      inertNumberInput({
        className: 'calendar-activity-start-input',
        min: 0,
        max: 23,
        step: 1,
        value: 18,
      }),
    ),
    el(
      'label',
      { className: 'calendar-setting-field compact-field' },
      el('span', { text: 'Rotate every wk' }),
      inertNumberInput({
        className: 'calendar-activity-rotation-interval-input',
        min: 1,
        max: 12,
        step: 1,
        value: 1,
      }),
    ),
    el(
      'label',
      { className: 'calendar-setting-field compact-field' },
      el('span', { text: 'Duration h' }),
      inertNumberInput({
        className: 'calendar-activity-duration-input',
        min: 0.25,
        max: 12,
        step: '0.25',
        value: 2,
      }),
    ),
    el(
      'label',
      { className: 'calendar-setting-field compact-field' },
      el('span', { text: 'Sessions/wk' }),
      inertNumberInput({
        className: 'calendar-activity-sessions-input',
        min: 1,
        max: 21,
        step: 1,
        value: 5,
      }),
    ),
    el(
      'div',
      { className: 'calendar-day-hours-grid' },
      ...CALENDAR_WEEKDAY_OPTIONS.map(weekdayHoursInput),
    ),
    el('p', {
      className: 'muted-copy calendar-weekly-summary',
      text: 'Weekly hours are generated from selected days and their per-day practice hours.',
    }),
  );
  form.append(
    button('Add activity', {
      className: 'primary-button',
      onClick: () => {
        const mode = form.querySelector<HTMLSelectElement>(
          '.calendar-activity-mode-select',
        )?.value;
        const rotationStepDays = Number(
          form.querySelector<HTMLSelectElement>(
            '.calendar-activity-rotation-select',
          )?.value ?? 0,
        );
        store.commands.addCalendarActivity({
          title: readTextControl(
            form,
            '.calendar-activity-title-input',
            'Activity',
          ),
          color: readTextControl(
            form,
            '.calendar-activity-color-input',
            DEFAULT_ACTIVITY_COLOR,
          ),
          mode: mode === 'flexible_weekly' ? 'flexible_weekly' : 'fixed_weekly',
          days: selectedActivityDays(form),
          dailyDurations: selectedDailyDurations(form),
          startMinute:
            Math.max(
              0,
              Math.min(
                23,
                numericInput(form, '.calendar-activity-start-input', 18),
              ),
            ) * 60,
          durationMinutes:
            numericInput(form, '.calendar-activity-duration-input', 2) * 60,
          sessionsPerWeek: numericInput(
            form,
            '.calendar-activity-sessions-input',
            5,
          ),
          rotationStepDays,
          rotationIntervalWeeks: numericInput(
            form,
            '.calendar-activity-rotation-interval-input',
            1,
          ),
        });
      },
    }),
  );
  return form;
}

export function renderActivitySettings(
  viewModel: CalendarViewModel,
  store: PlannerStore,
): HTMLElement {
  return panel(
    'Calendar settings',
    {
      id: 'calendar:settings',
      collapsible: false,
      className: 'calendar-settings-panel',
    },
    el('p', {
      className: 'muted-copy',
      text: 'Hourly placement uses a local learning model, avoids fixed activities by default, and keeps dragged study blocks as explicit overrides.',
    }),
    renderActivityForm(viewModel, store),
    renderActivityList(viewModel, store),
  );
}
