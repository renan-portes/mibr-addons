import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ComandoClient } from "../src/providers/comando/comandoClient.js";
import { ComandoParser } from "../src/providers/comando/comandoParser.js";
import { ComandoProvider } from "../src/providers/comando/comandoProvider.js";
import type { TorrentCandidateResolver } from "../src/providers/torrentIndexer/torrentCandidateResolver.js";

describe("Comando Provider", () => {
  it("queries movie streams and maps items to StreamResult", async () => {
    const fakeClient = {
      async fetch() {
        return {
          results: [
            {
              title: "Homem-Aranha: Um Novo Dia Torrent 1080p",
              imdb: "tt22084616",
              audio: ["Português", "Inglês"],
              size: "4.12 GB",
              info_hash: "b97d7e8f0601893f4d5df1893735ce6d76760658",
              magnet_link: "magnet:?xt=urn:btih:b97d7e8f0601893f4d5df1893735ce6d76760658",
              files: [{ path: "spider.mkv" }],
              trackers: [],
              peers: {},
            },
          ],
        };
      },
    } as unknown as ComandoClient;

    const fakeResolver = {
      async resolve() {
        return {
          url: "https://realdebrid.test/download/spider.mkv",
          source: "authorized-resolver",
        };
      },
    } as unknown as TorrentCandidateResolver;

    const provider = new ComandoProvider({
      client: fakeClient,
      parser: new ComandoParser(),
      resolver: fakeResolver,
    });

    const streams = await provider.getStreams(
      { type: "movie", id: "tt22084616" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.equal(streams[0].name, "Comando (RD)");
    assert.equal(streams[0].url, "https://realdebrid.test/download/spider.mkv");
    assert.ok(streams[0].title.includes("Homem-Aranha"));
  });

  it("ignores non-movie/series queries or invalid IMDb IDs", async () => {
    const provider = new ComandoProvider({
      client: {} as unknown as ComandoClient,
      parser: new ComandoParser(),
    });

    const results = await provider.getStreams(
      { type: "anime" as unknown as "movie", id: "invalid" },
      new AbortController().signal,
    );

    assert.deepEqual(results, []);
  });
});
