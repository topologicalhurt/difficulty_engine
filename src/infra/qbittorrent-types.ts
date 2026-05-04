export interface TorrentInfo {
  hash?: string;
  name?: string;
  content_path?: string;
  amount_left?: number;
  progress?: number;
  save_path?: string;
  state?: string;
}

export interface TorrentFile {
  index?: number;
  name?: string;
  progress?: number;
  priority?: number;
  size?: number;
}

export interface SearchResult {
  descrLink?: string;
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
  nbLeechers?: number;
  nbSeeders?: number;
  siteUrl?: string;
}

export interface SearchResultsResponse {
  results?: SearchResult[];
  status?: string;
  total?: number;
}
