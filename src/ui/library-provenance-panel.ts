import type { BookRecord, EnrichmentFieldProvenance } from '../core/types';
import { card, el } from './dom';
import { formatPercent } from './format';

function provenanceLine(
  label: string,
  provenance?: EnrichmentFieldProvenance,
): HTMLElement | null {
  if (!provenance) return null;
  const confidence = formatPercent(provenance.confidence);
  const strategy = provenance.strategy
    ? ` · ${provenance.strategy.replace(/_/g, ' ')}`
    : '';
  const inferred = provenance.inferred ? ' · inferred' : '';
  return el('div', {
    text: `${label}: ${provenance.provider} · ${confidence}${strategy}${inferred}`,
  });
}

export function renderEnrichmentProvenanceCard(
  book: BookRecord,
  enrichmentStatus: string,
  enrichmentError: string | null,
): HTMLElement {
  const provenance = book.enrichment.provenance;
  return card(
    'Enrichment provenance',
    el(
      'div',
      { className: 'stack-list' },
      el('div', {
        className: 'muted-copy',
        text: `Status: ${enrichmentStatus}`,
      }),
      el('div', {
        className: 'muted-copy',
        text: enrichmentError ?? 'No enrichment errors.',
      }),
      provenanceLine('Chapters', provenance?.chapters),
      provenanceLine('Description', provenance?.description),
      provenanceLine('Subjects', provenance?.subjects),
      book.openLibraryEditionKey
        ? el('div', {
            className: 'muted-copy',
            text: `Open Library edition: ${book.openLibraryEditionKey}`,
          })
        : null,
      book.openLibraryWorkKey
        ? el('div', {
            className: 'muted-copy',
            text: `Open Library work: ${book.openLibraryWorkKey}`,
          })
        : null,
      book.googleBooksId
        ? el('div', {
            className: 'muted-copy',
            text: `Google Books: ${book.googleBooksId}`,
          })
        : null,
    ),
  );
}
