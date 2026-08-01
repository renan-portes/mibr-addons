import { readFile } from "node:fs/promises";
import type { DataClient } from "../../types/dataClient.js";
import type { StreamQuery } from "../../types/streamProvider.js";

export class FixtureDataClient implements DataClient<StreamQuery, string> {
  constructor(private readonly fixturePath: string) {}

  async fetch(_query: StreamQuery, signal: AbortSignal): Promise<string> {
    return readFile(this.fixturePath, { encoding: "utf8", signal });
  }
}
