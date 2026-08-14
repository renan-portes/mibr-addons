import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataClient } from "../src/types/dataClient.js";
import { FenixFlixProvider } from "../src/providers/fenixflix/fenixFlixProvider.js";
import type { FenixFlixRawResponse, FenixFlixRequest } from "../src/providers/fenixflix/fenixFlixTypes.js";

class MockFenixFlixClient implements DataClient<FenixFlixRequest, FenixFlixRawResponse> {
  async fetch(): Promise<FenixFlixRawResponse> {
    return {
      streams: [
        {
          name: "FenixFlix 1080p",
          title: "🐦‍🔥 A Origem | 🇧🇷 Dublado | Hypex",
          url: "https://example.com/fenix.mkv",
        },
      ],
    };
  }
}

describe("FenixFlixProvider", () => {
  it("queries movie streams and maps items to StreamResult", async () => {
    const provider = new FenixFlixProvider({ client: new MockFenixFlixClient() });
    const streams = await provider.getStreams(
      { type: "movie", id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.match(streams[0]?.name ?? "", /FenixFlix/);
    assert.match(streams[0]?.title ?? "", /A Origem/);
    assert.equal(streams[0]?.url, "https://example.com/fenix.mkv");
  });

  it("ignores non-movie/series queries", async () => {
    const provider = new FenixFlixProvider({ client: new MockFenixFlixClient() });
    const streams = await provider.getStreams(
      { type: "channel" as any, id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 0);
  });
});
