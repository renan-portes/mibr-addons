import type { StremioStream } from "../../types/stremio.js";

export interface KingVodRawResponse {
  readonly streams?: readonly StremioStream[];
}

export interface KingVodRequest {
  readonly type: "movie" | "series";
  readonly id: string;
}

export interface KingVodResponse {
  readonly streams: readonly StremioStream[];
}
