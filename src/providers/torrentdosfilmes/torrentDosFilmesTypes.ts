export type TorrentDosFilmesRawResponse = unknown;

export interface TorrentDosFilmesItem {
  readonly title: string;
  readonly imdb?: string;
  readonly audio?: readonly string[];
  readonly quality?: string;
  readonly magnet?: string;
  readonly infoHash?: string;
  readonly size?: string;
  readonly seeders?: number;
  readonly isMock?: boolean;
}

export interface TorrentDosFilmesResponse {
  readonly items: readonly TorrentDosFilmesItem[];
  readonly count?: number;
}

export interface TorrentDosFilmesRequest {
  readonly imdb?: string;
  readonly q?: string;
  readonly limit?: number;
}

export interface TorrentDosFilmesClientOptions {
  readonly baseUrl?: string | URL;
}
