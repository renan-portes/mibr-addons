import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataClient } from "../src/types/dataClient.js";
import { BrazucaProvider } from "../src/providers/brazuca/brazucaProvider.js";
import type { BrazucaRawResponse, BrazucaRequest } from "../src/providers/brazuca/brazucaTypes.js";

class MockBrazucaClient implements DataClient<BrazucaRequest, BrazucaRawResponse> {
  async fetch(): Promise<BrazucaRawResponse> {
    return {
      streams: [
        {
          name: "Brazuca Torrents",
          title: "Inception Dual Audio",
          infoHash: "c301b175cae6ae4870076bd478680b6e3fc13743",
        },
      ],
    };
  }
}

describe("BrazucaProvider", () => {
  it("queries movie streams and maps items to StreamResult", async () => {
    const provider = new BrazucaProvider({ client: new MockBrazucaClient() });
    const streams = await provider.getStreams(
      { type: "movie", id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.match(streams[0]?.name ?? "", /Brazuca/);
    assert.equal(streams[0]?.infoHash, "c301b175cae6ae4870076bd478680b6e3fc13743");
  });

  it("ignores non-movie/series queries", async () => {
    const provider = new BrazucaProvider({ client: new MockBrazucaClient() });
    const streams = await provider.getStreams(
      { type: "channel" as any, id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 0);
  });
});
