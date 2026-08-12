import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { HttpDataClient } from "../src/clients/http/httpDataClient.js";
import { BluDVClient } from "../src/providers/bludv/bludvClient.js";
import { BluDVParser } from "../src/providers/bludv/bludvParser.js";
import { BluDVProvider } from "../src/providers/bludv/bludvProvider.js";
import type { BluDVRawResponse, BluDVRequest } from "../src/providers/bludv/bludvTypes.js";
import type { TorrentCandidateResolver } from "../src/providers/torrentIndexer/torrentCandidateResolver.js";
import { ProviderManager } from "../src/services/providerManager.js";
import { StreamService } from "../src/services/streamService.js";
import type { DataClient } from "../src/types/dataClient.js";

const FIXTURE_URL = new URL("./fixtures/bludvFixture.json", import.meta.url);

class MockClient implements DataClient<BluDVRequest, BluDVRawResponse> {
  lastRequest?: BluDVRequest;
  constructor(private readonly response: BluDVRawResponse) {}

  async fetch(request: BluDVRequest): Promise<BluDVRawResponse> {
    this.lastRequest = request;
    return this.response;
  }
}

describe("BluDV Provider", () => {
  describe("BluDVParser", () => {
    it("parses valid fixture items correctly", async () => {
      const content = await readFile(FIXTURE_URL, "utf8");
      const json = JSON.parse(content);
      const parser = new BluDVParser();
      const result = parser.parse(json);

      assert.equal(result.items.length, 2);
      assert.equal(result.items[0]?.title, "O Poderoso Chefão (1972) 1080p Dual Áudio");
      assert.equal(result.items[0]?.imdb, "tt0068646");
      assert.equal(result.items[0]?.infoHash, "0123456789abcdef0123456789abcdef01234567");
      assert.equal(result.items[0]?.magnet, "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Godfather");
      assert.deepEqual(result.items[0]?.audio, ["Português", "Inglês"]);
      assert.equal(result.items[0]?.peers?.seeders, 150);
    });

    it("handles null, invalid or empty payloads gracefully", () => {
      const parser = new BluDVParser();
      assert.deepEqual(parser.parse(null), { items: [] });
      assert.deepEqual(parser.parse(undefined), { items: [] });
      assert.deepEqual(parser.parse("not-json"), { items: [] });
      assert.deepEqual(parser.parse({ items: "not-an-array" }), { items: [], count: 0 });
    });

    it("filters out items without valid infoHash and magnet or without title", () => {
      const parser = new BluDVParser();
      const raw = {
        results: [
          { title: "", info_hash: "0123456789abcdef0123456789abcdef01234567" },
          { title: "No hash or magnet" },
          { title: "Invalid hash", info_hash: "invalid-hash-value" },
          { title: "Valid Item", info_hash: "1111111111222222222233333333334444444444" },
        ],
      };
      const result = parser.parse(raw);
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0]?.title, "Valid Item");
    });
  });

  describe("BluDVClient", () => {
    it("validates base URL and constructs query parameters", async () => {
      let requestedUrl = "";
      const fakeHttpClient = {
        async getJson<T>(url: URL): Promise<T> {
          requestedUrl = url.toString();
          return { results: [] } as T;
        },
      } as unknown as HttpDataClient;

      const client = new BluDVClient(fakeHttpClient, {
        baseUrl: "https://indexer.example.com",
      });

      await client.fetch({ imdb: "tt0068646", limit: 5 }, new AbortController().signal);
      assert.equal(requestedUrl, "https://indexer.example.com/indexers/bludv?imdb=tt0068646&limit=5");
    });

    it("rejects invalid base URL", () => {
      const fakeHttpClient = {} as HttpDataClient;
      assert.throws(() => new BluDVClient(fakeHttpClient, { baseUrl: "invalid-url" }));
      assert.throws(() => new BluDVClient(fakeHttpClient, { baseUrl: "ftp://example.com" }));
    });
  });

  describe("BluDVProvider", () => {
    it("queries movie streams and maps items to StreamResult", async () => {
      const content = await readFile(FIXTURE_URL, "utf8");
      const json = JSON.parse(content);
      const mockClient = new MockClient(json);
      const provider = new BluDVProvider({ client: mockClient });

      const streams = await provider.getStreams(
        { type: "movie", id: "tt0068646" },
        new AbortController().signal,
      );

      assert.equal(streams.length, 1);
      assert.equal(streams[0]?.name, "BluDV Provider");
      assert.match(streams[0]?.title ?? "", /O Poderoso Chefão/);
      assert.match(streams[0]?.title ?? "", /150/);
      assert.equal(streams[0]?.url, "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Godfather");
      assert.equal(mockClient.lastRequest?.imdb, "tt0068646");
    });

    it("ignores non-matching media types or invalid IMDb IDs", async () => {
      const mockClient = new MockClient({ results: [] });
      const provider = new BluDVProvider({ client: mockClient });

      const invalidType = await provider.getStreams(
        { type: "channel" as unknown as "movie", id: "tt0068646" },
        new AbortController().signal,
      );
      assert.deepEqual(invalidType, []);

      const invalidId = await provider.getStreams(
        { type: "movie", id: "invalid-id" },
        new AbortController().signal,
      );
      assert.deepEqual(invalidId, []);
    });

    it("never exposes a magnet as a playback URL directly through StreamService", async () => {
      const content = await readFile(FIXTURE_URL, "utf8");
      const json = JSON.parse(content);
      const mockClient = new MockClient(json);
      const provider = new BluDVProvider({ client: mockClient });

      const manager = new ProviderManager();
      manager.register(provider);

      const service = new StreamService(manager);
      const streams = await service.getStreams("movie", "tt0068646");

      assert.equal(streams.length, 0);
    });

    it("resolves BluDV torrent candidates via Real-Debrid resolver and delivers playable HTTP stream to StreamService", async () => {
      const content = await readFile(FIXTURE_URL, "utf8");
      const json = JSON.parse(content);
      const mockClient = new MockClient(json);

      const mockResolver: TorrentCandidateResolver = {
        async resolve(request) {
          if (request.infoHash === "0123456789abcdef0123456789abcdef01234567") {
            return {
              url: "https://real-debrid.example.com/download/godfather.mp4",
              source: "authorized-resolver",
            };
          }
          return null;
        },
      };

      const provider = new BluDVProvider({ client: mockClient, resolver: mockResolver });
      const manager = new ProviderManager();
      manager.register(provider);

      const service = new StreamService(manager);
      const streams = await service.getStreams("movie", "tt0068646");

      assert.equal(streams.length, 1);
      assert.equal(streams[0]?.name, "BluDV Provider (Real-Debrid)");
      assert.equal(streams[0]?.url, "https://real-debrid.example.com/download/godfather.mp4");
      assert.match(streams[0]?.title ?? "", /O Poderoso Chefão/);
    });

    it("handles candidate resolver failure gracefully without crashing", async () => {
      const content = await readFile(FIXTURE_URL, "utf8");
      const json = JSON.parse(content);
      const mockClient = new MockClient(json);

      const failingResolver: TorrentCandidateResolver = {
        async resolve() {
          throw new Error("Debrid API temporary error");
        },
      };

      const provider = new BluDVProvider({ client: mockClient, resolver: failingResolver });
      const streams = await provider.getStreams(
        { type: "movie", id: "tt0068646" },
        new AbortController().signal,
      );

      assert.equal(streams.length, 1);
      assert.equal(streams[0]?.name, "BluDV Provider");
      assert.equal(streams[0]?.url, "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Godfather");
    });
  });
});
