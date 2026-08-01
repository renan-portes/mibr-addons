import type { MediaType } from "./mediaType.js";
import type { StreamResult } from "./streamResult.js";

export interface StreamQuery {
  type: MediaType;
  id: string;
}

export interface StreamProvider {
  readonly id: string;
  readonly name: string;
  getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]>;
}
