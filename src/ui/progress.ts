import type {
  BookProgressView,
  OverallProgressView,
} from '../app/selectors/progress';
import { el } from './dom';
import { formatCssPercent, formatOneDecimal, round0 } from './format';

interface ProgressRenderOptions {
  compact?: boolean;
  showDetail?: boolean;
}

function progressPercent(
  progress: BookProgressView | OverallProgressView,
): number {
  return Math.max(0, Math.min(100, progress.percent));
}

function progressDetail(
  progress: BookProgressView | OverallProgressView,
): string {
  if ('completeBooks' in progress) return progress.detail;
  const minutes =
    progress.loggedMinutes > 0
      ? ` · ${formatOneDecimal(progress.loggedMinutes / 60)}h logged`
      : '';
  return `${progress.detail}${minutes}`;
}

export function renderProgressBar(
  progress: BookProgressView | OverallProgressView,
  options: ProgressRenderOptions = {},
): HTMLElement {
  const fill = el('div', { className: 'progress-fill' });
  fill.style.width = formatCssPercent(progressPercent(progress) / 100);

  return el(
    'div',
    {
      className: `progress-block${options.compact ? ' compact-progress' : ''}`,
    },
    el(
      'div',
      { className: 'progress-head' },
      el('span', { text: progress.label }),
      el('strong', { text: `${round0(progress.percent)}%` }),
    ),
    el('div', { className: 'progress-track', role: 'progressbar' }, fill),
    options.showDetail === false
      ? null
      : el('div', {
          className: 'progress-detail muted-copy',
          text: progressDetail(progress),
        }),
  );
}
