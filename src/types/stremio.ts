export type StremioResource = "stream" | "catalog" | "meta";

export type StremioType = "channel" | "tv" | "movie" | "series";

export interface StremioCatalogExtra {
  name: string;
  isRequired?: boolean;
  options?: string[];
}

export interface StremioCatalog {
  id: string;
  type: StremioType;
  name: string;
  extra?: StremioCatalogExtra[];
}

export interface StremioManifestBehaviorHints {
  configurable?: boolean;
  configurationRequired?: boolean;
}

export interface StremioManifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  icon?: string;
  logo?: string;
  background?: string;
  resources: StremioResource[];
  types: StremioType[];
  catalogs?: StremioCatalog[];
  idPrefixes: string[];
  behaviorHints?: StremioManifestBehaviorHints;
}

export interface StremioStreamBehaviorHints {
  notWebReady?: boolean;
  proxyHeaders?: {
    request?: Record<string, string>;
  };
}

export interface StremioStream {
  name: string;
  title: string;
  url?: string;
  externalUrl?: string;
  behaviorHints?: StremioStreamBehaviorHints;
}

export interface StremioStreamResponse {
  streams: StremioStream[];
}

export interface StremioMeta {
  id: string;
  type: StremioType;
  name: string;
  poster?: string;
  posterShape?: "square" | "poster" | "landscape";
  banner?: string;
  logo?: string;
  background?: string;
  description?: string;
  genres?: string[];
}

export interface StremioCatalogResponse {
  metas: StremioMeta[];
}

export interface StremioMetaResponse {
  meta?: StremioMeta;
}

export interface ErrorResponse {
  error: string;
}
