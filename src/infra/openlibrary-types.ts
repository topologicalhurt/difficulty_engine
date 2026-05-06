export interface SearchDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_sentence?: string | string[] | { value?: string };
  subject?: string[];
  subject_facet?: string[];
  subject_key?: string[];
  edition_key?: string[];
  cover_edition_key?: string;
  isbn?: string[];
  publisher?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
  ratings_average?: number;
}

export interface SearchResponse {
  docs?: SearchDoc[];
}

export interface EditionResponse {
  key?: string;
  title?: string;
  subtitle?: string;
  authors?: Array<{ key?: string }>;
  table_of_contents?: Array<{ title?: string } | string>;
  description?: string | { value?: string };
  subjects?: string[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  works?: Array<{ key?: string }>;
  isbn_10?: string[];
  isbn_13?: string[];
}

export interface WorkResponse {
  key?: string;
  description?: string | { value?: string };
  subjects?: string[];
  title?: string;
  covers?: number[];
}

export type OpenLibraryJsonFetcher = <T>(
  url: string,
  signal?: AbortSignal,
) => Promise<T>;
