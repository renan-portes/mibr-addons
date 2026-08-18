import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FrostViewProvider } from "../src/providers/frostview/frostViewProvider.js";
import { FrostViewClient } from "../src/providers/frostview/frostViewClient.js";
import type { FrostViewRawResponse, FrostViewRequest } from "../src/providers/frostview/frostViewTypes.js";

class MockFrostViewClient extends FrostViewClient {
  constructor() {
    super({} as any);
  }

  override async fetchStreams(_request: FrostViewRequest): Promise<FrostViewRawResponse> {
    return {
      streams: [
        {
          name: "FrostView 4K",
          title: "🌊 Globo",
          url: "https://example.com/globo.m3u8",
        },
      ],
    };
  }
}

describe("FrostViewProvider", () => {
  it("queries channel streams and maps items to StreamResult", async () => {
    const provider = new FrostViewProvider({ client: new MockFrostViewClient() });
    const streams = await provider.getStreams(
      { type: "channel" as any, id: "cs:channel:globo" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.match(streams[0]?.name ?? "", /FrostView TV/);
    assert.equal(streams[0]?.url, "https://example.com/globo.m3u8");
  });

  it("ignores non-channel queries", async () => {
    const provider = new FrostViewProvider({ client: new MockFrostViewClient() });
    const streams = await provider.getStreams(
      { type: "movie", id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 0);
  });
});
