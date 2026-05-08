import { EXAMPLE_BOOK } from '../src/core/defaults';
import { qbittorrentSearchQueries } from '../src/infra/qbittorrent-search';
import { defaultDocumentAcquisitionPolicy } from '../src/infra/document-acquisition';

const fixtures = [
  {
    title: 'Discrete-time Signal Processing, 2nd, Second Edition',
    short: 'Discrete-time Signal Processing',
    authors: ['Ronald W. Oppenheim Alan V. / Schafer'],
    isbn: null,
  },
  {
    title: 'Practical Electronics for Inventors, 4th Edition',
    short: 'Practical Electronics',
    authors: ['Paul Scherz'],
    isbn: null,
  },
];

for (const fixture of fixtures) {
  const queries = qbittorrentSearchQueries({
    book: { ...EXAMPLE_BOOK, ...fixture, sourcePath: null },
    policy: { ...defaultDocumentAcquisitionPolicy(), enabled: true },
  });
  console.log(`\n${fixture.title}`);
  for (const query of queries) {
    console.log(`- ${query.intent}: ${query.pattern}`);
  }
}
