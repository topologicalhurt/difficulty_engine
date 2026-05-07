export interface TorrentInfo {
  category?: string;
  hash?: string;
  name?: string;
  content_path?: string;
  magnet_uri?: string;
  num_leechs?: number;
  num_seeds?: number;
  amount_left?: number;
  availability?: number;
  dlspeed?: number;
  eta?: number;
  progress?: number;
  save_path?: string;
  size?: number;
  state?: string;
  total_size?: number;
}

export interface TorrentFile {
  index?: number;
  name?: string;
  progress?: number;
  priority?: number;
  size?: number;
  availability?: number;
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
