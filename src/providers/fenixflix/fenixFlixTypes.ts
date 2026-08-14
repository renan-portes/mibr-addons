import type { StremioStream } from "../../types/stremio.js";

export interface FenixFlixRawResponse {
  readonly streams?: readonly StremioStream[];
}

export interface FenixFlixRequest {
  readonly type: "movie" | "series";
  readonly id: string;
}

export interface FenixFlixResponse {
  readonly streams: readonly StremioStream[];
}
