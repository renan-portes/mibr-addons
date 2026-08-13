export type StremioResource = "stream";

export type StremioType = "movie" | "series";

export interface StremioManifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  icon?: string;
  logo?: string;
  resources: StremioResource[];
  types: StremioType[];
  idPrefixes: string[];
}

export interface StremioStream {
  name: string;
  title: string;
  url?: string;
  infoHash?: string;
  fileIdx?: number;
}

export interface StremioStreamResponse {
  streams: StremioStream[];
}

export interface ErrorResponse {
  error: string;
}
