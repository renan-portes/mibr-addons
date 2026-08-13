import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataClient } from "../src/types/dataClient.js";
import { MicoLeaoProvider } from "../src/providers/micoleao/micoleaoProvider.js";
import type { MicoLeaoRawResponse, MicoLeaoRequest } from "../src/providers/micoleao/micoleaoTypes.js";

class MockMicoLeaoClient implements DataClient<MicoLeaoRequest, MicoLeaoRawResponse> {
  async fetch(): Promise<MicoLeaoRawResponse> {
    return {
      results: [
        {
          title: "Mico Leão | Inception / A Origem (2010) 1080p Dual Áudio",
          imdb: "tt1375666",
          audio: ["Português", "Inglês"],
          magnet: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Inception",
          info_hash: "0123456789abcdef0123456789abcdef01234567",
          size: "2.1 GB",
        },
      ],
      count: 1,
    };
  }
}

describe("MicoLeaoProvider", () => {
  it("queries movie streams and maps items to StreamResult", async () => {
    const provider = new MicoLeaoProvider({ client: new MockMicoLeaoClient() });
    const streams = await provider.getStreams(
      { type: "movie", id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.equal(streams[0]?.name, "Mico Leão Dublado");
    assert.match(streams[0]?.title ?? "", /A Origem/);
    assert.equal(streams[0]?.url, "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567");
  });

  it("ignores non-movie/series queries", async () => {
    const provider = new MicoLeaoProvider({ client: new MockMicoLeaoClient() });
    const streams = await provider.getStreams(
      { type: "channel" as any, id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 0);
  });
});
