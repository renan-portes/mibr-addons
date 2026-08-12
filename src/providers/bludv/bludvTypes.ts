export type BluDVRawResponse = unknown;

export interface BluDVFile {
  readonly path: string;
  readonly size?: string;
}

export interface BluDVPeerCounts {
  readonly seeders?: number;
  readonly leechers?: number;
}

export interface BluDVItem {
  readonly title: string;
  readonly imdb?: string;
  readonly audio?: readonly string[];
  readonly magnet?: string;
  readonly infoHash?: string;
  readonly trackers?: readonly string[];
  readonly size?: string;
  readonly files?: readonly BluDVFile[];
  readonly peers?: BluDVPeerCounts;
}

export interface BluDVResponse {
  readonly items: readonly BluDVItem[];
  readonly count?: number;
}

export interface BluDVRequest {
  readonly imdb?: string;
  readonly q?: string;
  readonly limit?: number;
  readonly year?: string;
}
