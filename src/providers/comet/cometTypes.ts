import type { StremioStream } from "../../types/stremio.js";

export interface CometRawResponse {
  readonly streams?: readonly StremioStream[];
}

export interface CometRequest {
  readonly type: "movie" | "series";
  readonly id: string;
}
