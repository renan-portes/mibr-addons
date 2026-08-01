import type { DataClient } from "../../types/dataClient.js";
import type { Parser } from "../../types/parser.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { FixtureStreamCandidate } from "./fixtureTypes.js";

export class FixtureProvider implements StreamProvider {
  readonly id = "fixture";
  readonly name = "Fixture Provider";

  constructor(
    private readonly client: DataClient<StreamQuery, string>,
    private readonly parser: Parser<string, FixtureStreamCandidate[]>,
  ) {}

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    const rawData = await this.client.fetch(query, signal);
    const candidates = this.parser.parse(rawData);

    return candidates
      .filter((candidate) => candidate.type === query.type && candidate.id === query.id)
      .map((candidate) => ({
        name: this.name,
        title: `${candidate.title} | ${candidate.quality} | ${candidate.language}`,
        url: candidate.url,
      }));
  }
}
