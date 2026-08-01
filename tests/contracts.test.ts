import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProviderManager } from "../src/services/providerManager.js";
import { StreamService } from "../src/services/streamService.js";
import type { DataClient } from "../src/types/dataClient.js";
import type { Parser } from "../src/types/parser.js";
import type { StreamProvider, StreamQuery } from "../src/types/streamProvider.js";
import type { StreamResult } from "../src/types/streamResult.js";

interface FixturePayload {
  label: string;
  mediaUrl: string;
}

class FixtureClient implements DataClient<StreamQuery, FixturePayload> {
  async fetch(query: StreamQuery, signal: AbortSignal): Promise<FixturePayload> {
    assert.equal(signal.aborted, false);
    return {
      label: `Fixture (${query.type})`,
      mediaUrl: `https://example.com/${query.id}.mp4`,
    };
  }
}

class FixtureParser implements Parser<FixturePayload, StreamResult[]> {
  parse(payload: FixturePayload): StreamResult[] {
    return [{ name: "Fixture", title: payload.label, url: payload.mediaUrl }];
  }
}

class FixtureProvider implements StreamProvider {
  readonly id = "fixture";
  readonly name = "Fixture";

  constructor(
    private readonly client: DataClient<StreamQuery, FixturePayload>,
    private readonly parser: Parser<FixturePayload, StreamResult[]>,
  ) {}

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    const payload = await this.client.fetch(query, signal);
    return this.parser.parse(payload);
  }
}

describe("provider contracts", () => {
  it("keeps fetching, parsing and Stremio adaptation separated", async () => {
    const manager = new ProviderManager();
    manager.register(new FixtureProvider(new FixtureClient(), new FixtureParser()));

    const streams = await new StreamService(manager).getStreams("movie", "tt1234567");

    assert.deepEqual(streams, [
      {
        name: "Fixture",
        title: "Fixture (movie)",
        url: "https://example.com/tt1234567.mp4",
      },
    ]);
  });
});
