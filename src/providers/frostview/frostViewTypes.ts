import type { StremioStream } from "../../types/stremio.js";

export interface FrostViewRawResponse {
  readonly streams?: readonly StremioStream[];
}

export interface FrostViewRequest {
  readonly type: "channel";
  readonly id: string;
}

export interface FrostViewMeta {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly poster?: string;
  readonly background?: string;
  readonly logo?: string;
  readonly description?: string;
  readonly genres?: readonly string[];
}

export interface FrostViewCatalogResponse {
  readonly metas?: readonly FrostViewMeta[];
}

export interface FrostViewMetaResponse {
  readonly meta?: FrostViewMeta;
}
