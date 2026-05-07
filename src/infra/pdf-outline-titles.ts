const PDF_TITLE_PATTERN = /\/Title\s*\(([^)]{4,180})\)/g;
const PDF_HEX_TITLE_PATTERN = /\/Title\s*<([0-9a-f\s]{8,360})>/gi;
const PDF_OUTLINE_SCAN_CHARS = 260_000;
const OUTLINE_MARKER_PATTERN =
  /^(chapter|ch\.?|part|book|unit|section|appendix|lecture|lesson|module)\s+(\d+|[ivxlcdm]+|[a-z]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i;
const OUTLINE_CHAPTER_NUMBER_PATTERN =
  /^(?:chapter|ch\.?)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i;
const OUTLINE_MAJOR_CHAPTER_PATTERN =
  /^(?:chapter|ch\.?|part|book|unit|appendix|lecture|lesson|module)\s+/i;
const OUTLINE_DECIMAL_NUMBER_PATTERN = /^(\d{1,3})(?:\.\d+)*[.)]?\s+/;
const OUTLINE_FRONT_BACK_PATTERN =
  /^(?:contents?|cover|half title|title page|copyright|preface|foreword|acknowledgements?|about the author|photo credits|colophon|symbol index|index|bibliography|references)\b/i;
const OUTLINE_PATH_OR_NOISE_PATTERN =
  /(?:[A-Z]:[\\/].+\.(?:eps|pdf|png|jpe?g|tiff?)|^\(?\s*$|^%pdf-\d|^(?:\d+\s+){1,2}obj\b|^\/)/i;
const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

export function cleanPdfText(value: string): string {
  return value
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\\d{3}/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function decodePdfHexTitle(value: string): string {
  const hex = value.replace(/\s+/g, '');
  if (hex.length % 2 !== 0) return '';
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return cleanPdfText(new TextDecoder('utf-16be').decode(bytes.slice(2)));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return cleanPdfText(new TextDecoder('utf-16le').decode(bytes.slice(2)));
  }
  return cleanPdfText(new TextDecoder('iso-8859-1').decode(bytes));
}

export function decodePdfBytes(bytes: Uint8Array): string {
  return cleanPdfText(
    new TextDecoder('iso-8859-1')
      .decode(bytes)
      .slice(0, PDF_OUTLINE_SCAN_CHARS),
  );
}

export function extractPdfOutlineTitles(bytes: Uint8Array): string[] {
  const decoded = decodePdfBytes(bytes);
  const literalTitles = Array.from(decoded.matchAll(PDF_TITLE_PATTERN)).map(
    (match) => cleanPdfText(match[1] ?? ''),
  );
  const hexTitles = Array.from(decoded.matchAll(PDF_HEX_TITLE_PATTERN)).map(
    (match) => decodePdfHexTitle(match[1] ?? ''),
  );
  return normalizePdfOutlineTitles([...literalTitles, ...hexTitles]);
}

function outlineTitleIsNoise(title: string): boolean {
  return !title || OUTLINE_PATH_OR_NOISE_PATTERN.test(title);
}

function romanToNumber(value: string): number | null {
  const roman = value.toLowerCase();
  if (!/^[ivxlcdm]+$/.test(roman)) return null;
  const values: Record<string, number> = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  };
  let total = 0;
  for (let index = 0; index < roman.length; index += 1) {
    const current = values[roman[index] ?? ''] ?? 0;
    const next = values[roman[index + 1] ?? ''] ?? 0;
    total += current < next ? -current : current;
  }
  return total || null;
}

function markerNumber(value: string): number | null {
  const lower = value.toLowerCase();
  if (/^\d+$/.test(lower)) return Number(lower);
  if (WORD_NUMBERS[lower]) return WORD_NUMBERS[lower];
  return romanToNumber(lower);
}

function outlineMajorNumber(title: string): number | null {
  const chapterMatch = title.match(OUTLINE_CHAPTER_NUMBER_PATTERN);
  if (chapterMatch) return markerNumber(chapterMatch[1] ?? '');
  const decimalMatch = title.match(OUTLINE_DECIMAL_NUMBER_PATTERN);
  return decimalMatch ? Number(decimalMatch[1]) : null;
}

function pairSplitOutlineTitles(titles: string[]): string[] {
  const paired: string[] = [];
  for (let index = 0; index < titles.length; index += 1) {
    const title = titles[index] ?? '';
    const next = titles[index + 1] ?? '';
    if (
      OUTLINE_MARKER_PATTERN.test(title) &&
      next &&
      !OUTLINE_MARKER_PATTERN.test(next) &&
      !OUTLINE_FRONT_BACK_PATTERN.test(next)
    ) {
      paired.push(`${title} ${next}`);
      index += 1;
      continue;
    }
    paired.push(title);
  }
  return paired;
}

function mostlyDescending(numbers: number[]): boolean {
  if (numbers.length < 3) return false;
  let descendingPairs = 0;
  for (let index = 1; index < numbers.length; index += 1) {
    if ((numbers[index - 1] ?? 0) > (numbers[index] ?? 0)) {
      descendingPairs += 1;
    }
  }
  return descendingPairs >= Math.max(2, numbers.length - 2);
}

function sortOutlineChapterTitles(titles: string[]): string[] {
  const numbered = titles
    .map((title, index) => ({ title, index, number: outlineMajorNumber(title) }))
    .filter(
      (entry): entry is { title: string; index: number; number: number } =>
        entry.number != null,
    );
  if (!mostlyDescending(numbered.map((entry) => entry.number))) return titles;
  const sortedNumbers = new Map(
    [...numbered]
      .sort(
        (left, right) =>
          left.number - right.number || left.index - right.index,
      )
      .map((entry, index) => [entry.title, index]),
  );
  return [...titles].sort((left, right) => {
    const leftRank = sortedNumbers.get(left);
    const rightRank = sortedNumbers.get(right);
    if (leftRank == null && rightRank == null) return 0;
    if (leftRank == null) return -1;
    if (rightRank == null) return 1;
    return leftRank - rightRank;
  });
}

function preferStructuralOutlineTitles(titles: string[]): string[] {
  const majorChapters = titles.filter(
    (title) =>
      OUTLINE_MAJOR_CHAPTER_PATTERN.test(title) &&
      outlineMajorNumber(title) != null,
  );
  if (majorChapters.length >= 2) {
    return sortOutlineChapterTitles(majorChapters);
  }
  const structural = titles.filter((title) => outlineMajorNumber(title) != null);
  if (structural.length >= 2) return sortOutlineChapterTitles(structural);
  if (titles.length < 3) return [];
  return titles;
}

export function normalizePdfOutlineTitles(titles: string[]): string[] {
  const cleaned = titles.map(cleanPdfText).filter((title) => !outlineTitleIsNoise(title));
  const paired = pairSplitOutlineTitles(cleaned).filter(
    (title) => !OUTLINE_FRONT_BACK_PATTERN.test(title),
  );
  return preferStructuralOutlineTitles(paired);
}
