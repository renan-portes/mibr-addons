export type TorrentIndexerRawResponse = unknown;

export type TorrentIndexerAudio = string;
export type TorrentIndexerName = string;
export type TorrentInfoHash = string;
export type TorrentSize = string;
export type TorrentImdbId = string;
export type TorrentMagnet = string;

export interface TorrentPeerCounts {
  seeders?: number;
  leechers?: number;
}

export interface TorrentIndexerFile {
  path: string;
  size?: TorrentSize;
}

export interface TorrentIndexerItem {
  title: string;
  originalTitle?: string;
  details?: string;
  year?: string;
  imdb?: TorrentImdbId;
  audio: TorrentIndexerAudio[];
  magnet?: TorrentMagnet;
  infoHash?: TorrentInfoHash;
  trackers: string[];
  size?: TorrentSize;
  files: TorrentIndexerFile[];
  peers: TorrentPeerCounts;
}

export interface TorrentIndexerResponse {
  items: TorrentIndexerItem[];
  count?: number;
  indexedCount?: number;
}

export interface TorrentIndexerSource {
  indexer: TorrentIndexerName;
}

export type TorrentIndexerSortField =
  | "title"
  | "original_title"
  | "year"
  | "date"
  | "seed_count"
  | "leech_count"
  | "size"
  | "similarity";

export type TorrentIndexerSortDirection = "asc" | "desc";

export interface TorrentIndexerRequest {
  q?: string;
  filterResults?: boolean;
  limit?: number;
  sortBy?: TorrentIndexerSortField;
  sortDirection?: TorrentIndexerSortDirection;
  audio?: string[];
  year?: string;
  imdb?: TorrentImdbId;
}
