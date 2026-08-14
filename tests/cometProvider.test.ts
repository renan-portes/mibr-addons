import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataClient } from "../src/types/dataClient.js";
import { CometProvider } from "../src/providers/comet/cometProvider.js";
import type { CometRawResponse, CometRequest } from "../src/providers/comet/cometTypes.js";

class MockCometClient implements DataClient<CometRequest, CometRawResponse> {
  async fetch(): Promise<CometRawResponse> {
    return {
      streams: [
        {
          name: "Comet 1080p",
          title: "Inception (2010)",
          infoHash: "c301b175cae6ae4870076bd478680b6e3fc13743",
        },
      ],
    };
  }
}

describe("CometProvider", () => {
  it("queries movie streams and maps items to StreamResult", async () => {
    const provider = new CometProvider({ client: new MockCometClient() });
    const streams = await provider.getStreams(
      { type: "movie", id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.match(streams[0]?.name ?? "", /Comet/);
    assert.equal(streams[0]?.infoHash, "c301b175cae6ae4870076bd478680b6e3fc13743");
  });

  it("ignores non-movie/series queries", async () => {
    const provider = new CometProvider({ client: new MockCometClient() });
    const streams = await provider.getStreams(
      { type: "channel" as any, id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 0);
  });
});
