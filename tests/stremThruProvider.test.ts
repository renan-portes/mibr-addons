import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataClient } from "../src/types/dataClient.js";
import { StremThruProvider } from "../src/providers/stremthru/stremThruProvider.js";
import type { StremThruRawResponse, StremThruRequest } from "../src/providers/stremthru/stremThruTypes.js";

class MockStremThruClient implements DataClient<StremThruRequest, StremThruRawResponse> {
  async fetch(): Promise<StremThruRawResponse> {
    return {
      streams: [
        {
          name: "StremThru Torz",
          title: "Inception 1080p",
          infoHash: "c301b175cae6ae4870076bd478680b6e3fc13743",
        },
      ],
    };
  }
}

describe("StremThruProvider", () => {
  it("queries movie streams and maps items to StreamResult", async () => {
    const provider = new StremThruProvider({ client: new MockStremThruClient() });
    const streams = await provider.getStreams(
      { type: "movie", id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.match(streams[0]?.name ?? "", /StremThru/);
    assert.equal(streams[0]?.infoHash, "c301b175cae6ae4870076bd478680b6e3fc13743");
  });

  it("ignores non-movie/series queries", async () => {
    const provider = new StremThruProvider({ client: new MockStremThruClient() });
    const streams = await provider.getStreams(
      { type: "channel" as any, id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 0);
  });
});
