import { card, el } from './dom';

function bulletList(items: string[]): HTMLElement {
  return el('ul', { className: 'info-list' }, ...items.map((item) => el('li', { text: item })));
}

export function renderInfoView(): HTMLElement {
  return el(
    'div',
    { className: 'stack-layout' },
    card(
      'How to use the planner',
      bulletList([
        'Use Library to search and curate books, edit metadata, and set manual prerequisite or co-study links.',
        'Use Constraints to tune pacing, difficulty mapping, and scheduling behavior.',
        'Use Plan for the solved Gantt and calendar. This is the main reading schedule surface.',
        'Use Graphs for the DAG, relation network, hypergraph, weekly load, parallel occupancy, and difficulty ladder.',
        'Use Diagnostics to inspect warnings, relation evidence, difficulty breakdowns, and skim diffs between overlapping books.',
      ]),
    ),
    card(
      'How to read the plan',
      bulletList([
        'The Gantt shows target bars behind actual bars. Release markers show when a book first becomes eligible.',
        'Calendar chips stay compact by default; hover, focus, click, or open Log for floor, skim, backfill, and prerequisite details.',
        'Warnings explain why a plan may be blocked, stretched, or different from the target timeline.',
      ]),
    ),
    card(
      'Overlap and TOC quality',
      bulletList([
        'Skim suggestions depend on chapter and metadata quality. Better TOC coverage produces better overlap clustering.',
        'The diagnostics diff lists show shared topics and what the engine believes can be skimmed relative to the anchor book.',
        'Manual chapter cleanup still wins over imported metadata if Open Library data is weak or incomplete.',
      ]),
    ),
    card(
      'Glossary',
      bulletList([
        'Strict page floor: the default mode. Minimum pages/day is hard and conflicts are reported instead of hidden.',
        'Relaxed page recommendation: optional mode that can lower the page floor to keep the plan feasible.',
        'Relative pacing: stretches page/day targets across the current reading list; the curve selector controls whether that spread is linear, smooth, square-root, or power-shaped.',
        'Detected genre color: display-only coloring from available subject metadata and learned topic labels.',
        'Backfill: starting another eligible book to keep a parallel slot occupied when a branch is blocked.',
        'Prerequisite overlap: starting a dependent book before every prerequisite is fully finished under the configured policy.',
        'Display group: visual grouping only. It should not change solver truth.',
      ]),
    ),
  );
}
