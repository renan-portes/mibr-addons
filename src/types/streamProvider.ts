import type { StremioStream, StremioType } from "./stremio.js";

export interface StreamQuery {
  type: StremioType;
  id: string;
}

export interface StreamProvider {
  readonly id: string;
  readonly name: string;
  getStreams(query: StreamQuery): Promise<StremioStream[]>;
}
