import type { StremioStream } from "../../types/stremio.js";

export interface FrostStreamRawResponse {
  readonly streams?: readonly StremioStream[];
}

export interface FrostStreamRequest {
  readonly type: "movie" | "series";
  readonly id: string;
}

export interface FrostStreamResponse {
  readonly streams: readonly StremioStream[];
}
