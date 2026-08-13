import type { TorrentResult } from "../../types/torrentResult.js";

export interface MicoLeaoRequest {
  readonly imdb?: string;
  readonly q?: string;
  readonly limit?: number;
  readonly year?: string;
}

export interface MicoLeaoRawResponse {
  readonly results?: readonly unknown[];
  readonly count?: number;
}

export type MicoLeaoItem = TorrentResult;

export interface MicoLeaoResponse {
  readonly items: readonly MicoLeaoItem[];
}
