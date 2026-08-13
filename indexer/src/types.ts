/**
 * Shared types for the mibr-indexer microservice.
 */

export interface IndexerRequest {
  imdb?: string;
  q?: string;
  limit?: number;
}

export interface TorrentResult {
  title: string;
  imdb?: string;
  audio: string[];
  quality?: string;
  magnet?: string;
  info_hash?: string;
  size?: string;
  seeders?: number;
  files?: Array<{ path: string; size?: string }>;
  peers?: { seeders: number; leechers: number };
}

export interface IndexerResponse {
  results: TorrentResult[];
  count: number;
}

export type Indexer = (req: IndexerRequest, signal: AbortSignal) => Promise<IndexerResponse>;
