import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataClient } from "../src/types/dataClient.js";
import { FrostStreamProvider } from "../src/providers/froststream/frostStreamProvider.js";
import type { FrostStreamRawResponse, FrostStreamRequest } from "../src/providers/froststream/frostStreamTypes.js";

class MockFrostStreamClient implements DataClient<FrostStreamRequest, FrostStreamRawResponse> {
  async fetch(): Promise<FrostStreamRawResponse> {
    return {
      streams: [
        {
          name: "FrostStream 1080p",
          title: "🎬 A Origem (2010) | 🌎 Português",
          url: "https://example.com/video.mp4",
        },
      ],
    };
  }
}

describe("FrostStreamProvider", () => {
  it("queries movie streams and maps items to StreamResult", async () => {
    const provider = new FrostStreamProvider({ client: new MockFrostStreamClient() });
    const streams = await provider.getStreams(
      { type: "movie", id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.match(streams[0]?.name ?? "", /FrostStream/);
    assert.match(streams[0]?.title ?? "", /A Origem/);
    assert.equal(streams[0]?.url, "https://example.com/video.mp4");
  });

  it("ignores non-movie/series queries", async () => {
    const provider = new FrostStreamProvider({ client: new MockFrostStreamClient() });
    const streams = await provider.getStreams(
      { type: "channel" as any, id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 0);
  });
});
