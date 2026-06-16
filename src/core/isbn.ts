const ISBN10_PATTERN = /^\d{9}[\dX]$/;
const ISBN13_PATTERN = /^(?:978|979)\d{10}$/;

export function cleanedIsbn(value: string | null | undefined): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^0-9X]/g, '');
}

export function isValidIsbn10(value: string | null | undefined): boolean {
  const isbn = cleanedIsbn(value);
  if (!ISBN10_PATTERN.test(isbn)) return false;
  const sum = isbn.split('').reduce((total, char, index) => {
    const digit = char === 'X' ? 10 : Number(char);
    return total + digit * (10 - index);
  }, 0);
  return sum % 11 === 0;
}

export function isValidIsbn13(value: string | null | undefined): boolean {
  const isbn = cleanedIsbn(value);
  if (!ISBN13_PATTERN.test(isbn)) return false;
  const sum = isbn.split('').reduce((total, char, index) => {
    const digit = Number(char);
    return total + digit * (index % 2 === 0 ? 1 : 3);
  }, 0);
  return sum % 10 === 0;
}

export function isValidIsbn(value: string | null | undefined): boolean {
  return isValidIsbn10(value) || isValidIsbn13(value);
}

export function normalizedIsbn(value: string | null | undefined): string {
  const isbn = cleanedIsbn(value);
  return isValidIsbn(isbn) ? isbn : '';
}

// Persisted ISBN for a book record: keep a plausible-length (ISBN-10/13) code
// even when its check digit fails, so a typo'd or not-yet-validated value
// round-trips for display instead of being silently erased on every load.
// Identity and search still gate on normalizedIsbn (which validates).
export function persistedIsbn(value: string | null | undefined): string | null {
  const valid = normalizedIsbn(value);
  if (valid) return valid;
  const cleaned = cleanedIsbn(value);
  return cleaned.length === 10 || cleaned.length === 13 ? cleaned : null;
}

export function isIsbnLikeInput(value: string): boolean {
  const compact = value.replace(/[-\s]/g, '').toUpperCase();
  if (!compact) return false;
  if (!/^[0-9X]+$/.test(compact)) return false;
  return compact.indexOf('X') < 0 || compact.endsWith('X');
}
