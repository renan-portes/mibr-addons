import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataClient } from "../src/types/dataClient.js";
import { KingVodProvider } from "../src/providers/kingvod/kingVodProvider.js";
import type { KingVodRawResponse, KingVodRequest } from "../src/providers/kingvod/kingVodTypes.js";

class MockKingVodClient implements DataClient<KingVodRequest, KingVodRawResponse> {
  async fetch(): Promise<KingVodRawResponse> {
    return {
      streams: [
        {
          name: "👑 King VOD",
          title: "Dublado",
          url: "https://example.com/playlist.m3u8",
        },
      ],
    };
  }
}

describe("KingVodProvider", () => {
  it("queries movie streams and maps items to StreamResult", async () => {
    const provider = new KingVodProvider({ client: new MockKingVodClient() });
    const streams = await provider.getStreams(
      { type: "movie", id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.match(streams[0]?.name ?? "", /King VOD/);
    assert.equal(streams[0]?.url, "https://example.com/playlist.m3u8");
  });

  it("ignores non-movie/series queries", async () => {
    const provider = new KingVodProvider({ client: new MockKingVodClient() });
    const streams = await provider.getStreams(
      { type: "channel" as any, id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 0);
  });
});
