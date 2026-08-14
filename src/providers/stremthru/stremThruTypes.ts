import type { StremioStream } from "../../types/stremio.js";

export interface StremThruRawResponse {
  readonly streams?: readonly StremioStream[];
}

export interface StremThruRequest {
  readonly type: "movie" | "series";
  readonly id: string;
}
