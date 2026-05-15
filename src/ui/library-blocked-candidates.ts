import type {
  BookDocumentBlockedCandidateOption,
  BookRecord,
  PlannerStore,
} from '../core/types';
import { badge, button, el } from './dom';
import { formatOneDecimal } from './format';
import {
  blockedCandidateCanBeAdded,
  seedersLabel,
} from './document-source-actions';

export function renderBlockedCandidates(
  book: BookRecord,
  candidates: BookDocumentBlockedCandidateOption[],
  store: PlannerStore,
): HTMLElement {
  return el(
    'details',
    { className: 'document-card compact-stack' },
    el('summary', {
      text: `Raw matches found but blocked (${candidates.length})`,
    }),
    el(
      'div',
      { className: 'stack-list compact-stack' },
      ...candidates.slice(0, 10).map((candidate) =>
        el(
          'div',
          { className: 'document-card' },
          el(
            'div',
            { className: 'detail-toolbar' },
            badge(candidate.contentKind),
            candidate.retryableAsUserOwned
              ? badge('manual confirmable', 'warn')
              : null,
            el('strong', { text: candidate.title }),
          ),
          el('div', {
            className: 'muted-copy',
            text: [
              seedersLabel(candidate.seeders, candidate.availability),
              candidate.matchScore == null
                ? null
                : `match ${formatOneDecimal(candidate.matchScore * 10)}/10`,
              candidate.pattern ? `query "${candidate.pattern}"` : null,
              `blocked: ${candidate.blockedReasons.join(', ')}`,
            ]
              .filter(Boolean)
              .join(' · '),
          }),
          el('div', { className: 'muted-copy', text: candidate.sourceUrl }),
          blockedCandidateCanBeAdded(candidate)
            ? button(
                candidate.retryableAsUserOwned
                  ? 'Use as user-owned source'
                  : 'Add blocked result',
                {
                  className: 'ghost-button',
                  onClick: () =>
                    void store.commands.addBookTorrentSource(
                      book.id,
                      candidate.sourceUrl,
                    ),
                },
              )
            : null,
        ),
      ),
    ),
  );
}
