import type { AppState, BookRecord } from '../../core/types';

export interface RelationSelectorView {
  title: string;
  detail: string;
  selectedIds: string[];
  graphIds: string[];
  manualIds: string[];
}

export interface BookRelationSelectorSummary {
  incomingRelations: string[];
  outgoingRelations: string[];
  relationSelectors: {
    prereqs: RelationSelectorView;
    dependents: RelationSelectorView;
    coStudy: RelationSelectorView;
  };
}

export function emptyRelationSelectors(): BookRelationSelectorSummary['relationSelectors'] {
  const empty = { title: '', detail: '', selectedIds: [], graphIds: [], manualIds: [] };
  return { prereqs: empty, dependents: empty, coStudy: empty };
}

export function selectBookRelationSelectorSummary(
  state: AppState,
  book: BookRecord,
  allBooks: BookRecord[],
): BookRelationSelectorSummary {
  const relations = state.snapshot.relations;
  const graphPrereqs = relations
    .filter((relation) => relation.type === 'prerequisite' && relation.to === book.id)
    .map((relation) => relation.from);
  const graphDependents = allBooks
    .filter((candidate) =>
      relations.some(
        (relation) =>
          relation.type === 'prerequisite' &&
          relation.from === book.id &&
          relation.to === candidate.id,
      ),
    )
    .map((candidate) => candidate.id);
  const graphCoStudy = relations
    .filter((relation) => relation.type === 'co-study' && (relation.from === book.id || relation.to === book.id))
    .map((relation) => (relation.from === book.id ? relation.to : relation.from));
  const manualDependents = allBooks
    .filter((candidate) => candidate.manualPrereqs.includes(book.id))
    .map((candidate) => candidate.id);

  return {
    incomingRelations: relations
      .filter((relation) => relation.to === book.id)
      .map((relation) => `${relation.from} (${relation.type})`),
    outgoingRelations: relations
      .filter((relation) => relation.from === book.id)
      .map((relation) => `${relation.to} (${relation.type})`),
    relationSelectors: {
      prereqs: {
        title: 'Prerequisites',
        detail: 'Select books that must come before this book.',
        selectedIds: [...new Set([...book.manualPrereqs, ...graphPrereqs])],
        graphIds: graphPrereqs,
        manualIds: book.manualPrereqs,
      },
      dependents: {
        title: 'Required by',
        detail: 'Select books that should come after this book. This is the outgoing graph view of prerequisites.',
        selectedIds: [...new Set([...manualDependents, ...graphDependents])],
        graphIds: graphDependents,
        manualIds: manualDependents,
      },
      coStudy: {
        title: 'Co-study links',
        detail: 'Select books that should be planned together when feasible.',
        selectedIds: [...new Set([...book.manualCoStudy, ...graphCoStudy])],
        graphIds: graphCoStudy,
        manualIds: book.manualCoStudy,
      },
    },
  };
}
