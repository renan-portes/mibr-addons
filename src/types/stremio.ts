export type StremioResource = "stream" | "catalog" | "meta";

export type StremioType = "movie" | "series" | "channel";

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

export interface StremioManifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  icon?: string;
  logo?: string;
  resources: StremioResource[];
  types: StremioType[];
  catalogs?: StremioCatalog[];
  idPrefixes: string[];
}

export interface StremioStream {
  name: string;
  title: string;
  url?: string;
  externalUrl?: string;
  infoHash?: string;
  fileIdx?: number;
}

export interface StremioStreamResponse {
  streams: StremioStream[];
}

export interface ErrorResponse {
  error: string;
}
