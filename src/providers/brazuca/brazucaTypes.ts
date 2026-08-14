import type { StremioStream } from "../../types/stremio.js";

export interface BrazucaRawResponse {
  readonly streams?: readonly StremioStream[];
}

export interface BrazucaRequest {
  readonly type: "movie" | "series";
  readonly id: string;
}
