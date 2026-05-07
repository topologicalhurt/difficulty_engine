export interface TorrentInfo {
  category?: string;
  hash?: string;
  name?: string;
  content_path?: string;
  magnet_uri?: string;
  num_leechs?: number;
  num_seeds?: number;
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
  accessBasis?: string;
  descrLink?: string;
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
  license?: string;
  nbLeechers?: number;
  nbSeeders?: number;
  rights?: string;
  siteUrl?: string;
}

export interface SearchResultsResponse {
  results?: SearchResult[];
  status?: string;
  total?: number;
}
