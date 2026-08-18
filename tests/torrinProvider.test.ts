import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataClient } from "../src/types/dataClient.js";
import { TorrinProvider } from "../src/providers/torrin/torrinProvider.js";
import type { TorrinRawResponse, TorrinRequest } from "../src/providers/torrin/torrinTypes.js";

class MockTorrinClient implements DataClient<TorrinRequest, TorrinRawResponse> {
  async fetch(): Promise<TorrinRawResponse> {
    return {
      streams: [
        {
          name: "Torrin 1080p",
          title: "Inception (2010)",
          infoHash: "c301b175cae6ae4870076bd478680b6e3fc13743",
        },
      ],
    };
  }
}

describe("TorrinProvider", () => {
  it("queries movie streams and maps items to StreamResult", async () => {
    const provider = new TorrinProvider({ client: new MockTorrinClient() });
    const streams = await provider.getStreams(
      { type: "movie", id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.match(streams[0]?.name ?? "", /Torrin/);
    assert.equal(streams[0]?.infoHash, "c301b175cae6ae4870076bd478680b6e3fc13743");
  });

  it("ignores non-movie/series queries", async () => {
    const provider = new TorrinProvider({ client: new MockTorrinClient() });
    const streams = await provider.getStreams(
      { type: "channel" as any, id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 0);
  });
});
