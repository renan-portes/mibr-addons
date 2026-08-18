import type { StremioStream } from "../../types/stremio.js";

export interface TorrinRawResponse {
  readonly streams?: readonly StremioStream[];
}

export interface TorrinRequest {
  readonly type: "movie" | "series";
  readonly id: string;
}
