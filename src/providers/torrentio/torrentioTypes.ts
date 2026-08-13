export type TorrentioRawResponse = unknown;

export interface TorrentioBehaviorHints {
  readonly bencodeUrl?: string;
  readonly bingeGroup?: string;
  readonly filename?: string;
}

export interface TorrentioStreamItem {
  readonly name?: string;
  readonly title?: string;
  readonly infoHash?: string;
  readonly fileIdx?: number;
  readonly url?: string;
  readonly behaviorHints?: TorrentioBehaviorHints;
  readonly isMock?: boolean;
}

export interface TorrentioResponse {
  readonly streams: readonly TorrentioStreamItem[];
}

export interface TorrentioRequest {
  readonly type: "movie" | "series";
  readonly id: string;
}

export interface TorrentioClientOptions {
  readonly baseUrl?: string | URL;
}
