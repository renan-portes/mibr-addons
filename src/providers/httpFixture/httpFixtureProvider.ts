import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import type { MediaType } from "../../types/mediaType.js";
import type { Parser } from "../../types/parser.js";
import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { HttpFixtureCandidate } from "./httpFixtureTypes.js";

export type HttpFixtureEndpoints = Readonly<Record<MediaType, string | URL>>;

export class HttpFixtureProvider implements StreamProvider {
  readonly id = "http-fixture";
  readonly name = "HTTP Fixture Provider";

  constructor(
    private readonly client: HttpDataClient,
    private readonly parser: Parser<unknown, HttpFixtureCandidate[]>,
    private readonly endpoints: HttpFixtureEndpoints,
  ) {}

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    const payload = await this.client.getJson(this.endpoints[query.type], { signal });
    const candidates = this.parser.parse(payload);

    return candidates
      .filter((candidate) => candidate.type === query.type && candidate.id === query.id)
      .map((candidate) => ({
        name: this.name,
        title: `${candidate.title} | ${candidate.quality} | ${candidate.language}`,
        url: candidate.url,
      }));
  }
}
