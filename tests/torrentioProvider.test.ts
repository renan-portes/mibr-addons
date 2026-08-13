import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { HttpDataClient } from "../src/clients/http/httpDataClient.js";
import { TorrentioClient } from "../src/providers/torrentio/torrentioClient.js";
import { TorrentioParser } from "../src/providers/torrentio/torrentioParser.js";
import { TorrentioProvider } from "../src/providers/torrentio/torrentioProvider.js";
import type { TorrentioRawResponse } from "../src/providers/torrentio/torrentioTypes.js";
import type { TorrentCandidateResolutionRequest, TorrentCandidateResolver } from "../src/providers/torrentIndexer/torrentCandidateResolver.js";
import { ProviderManager } from "../src/services/providerManager.js";
import { StreamService } from "../src/services/streamService.js";

const torrentioFixture = JSON.parse(
  readFileSync(new URL("./fixtures/torrentioFixture.json", import.meta.url), "utf8"),
) as TorrentioRawResponse;

describe("Torrentio Provider", () => {
  describe("TorrentioParser", () => {
    it("parses valid Torrentio fixture", () => {
      const parser = new TorrentioParser();
      const parsed = parser.parse(torrentioFixture);

      assert.equal(parsed.streams.length, 2);
      assert.equal(parsed.streams[0]?.infoHash, "0123456789abcdef0123456789abcdef01234567");
      assert.equal(parsed.streams[1]?.url, "https://vjs.zencdn.net/v/oceans.mp4");
    });

    it("handles invalid or non-object responses gracefully", () => {
      const parser = new TorrentioParser();
      assert.deepEqual(parser.parse(null), { streams: [] });
      assert.deepEqual(parser.parse("invalid"), { streams: [] });
      assert.deepEqual(parser.parse({ streams: "invalid" }), { streams: [] });
    });
  });

  describe("TorrentioClient", () => {
    it("builds correct URL query path", async () => {
      let requestedUrl = "";
      const fakeHttpClient = {
        async getJson<T>(url: URL): Promise<T> {
          requestedUrl = url.toString();
          return { streams: [] } as T;
        },
      } as unknown as HttpDataClient;

      const client = new TorrentioClient(fakeHttpClient, {
        baseUrl: "https://torrentio.example.com",
      });

      await client.fetch({ type: "movie", id: "tt0068646" }, new AbortController().signal);
      assert.equal(requestedUrl, "https://torrentio.example.com/stream/movie/tt0068646.json");
    });

    it("supports mock mode for local testing", async () => {
      const fakeHttpClient = {} as HttpDataClient;
      const client = new TorrentioClient(fakeHttpClient, { baseUrl: "mock" });
      const result = await client.fetch({ type: "movie", id: "tt0068646" }, new AbortController().signal);

      assert.equal(typeof result, "object");
      assert.notEqual(result, null);
      assert.equal(Array.isArray((result as { streams: unknown[] }).streams), true);
    });
  });

  describe("TorrentioProvider", () => {
    it("queries movie streams and maps items to StreamResult", async () => {
      const fakeHttpClient = {
        async getJson<T>(): Promise<T> {
          return torrentioFixture as T;
        },
      } as unknown as HttpDataClient;

      const client = new TorrentioClient(fakeHttpClient);
      const parser = new TorrentioParser();
      const provider = new TorrentioProvider({ client, parser });

      const streams = await provider.getStreams(
        { type: "movie", id: "tt0068646" },
        new AbortController().signal,
      );

      assert.equal(streams.length, 1);
      assert.equal(streams[0]?.url, "https://vjs.zencdn.net/v/oceans.mp4");
      assert.match(streams[0]?.name ?? "", /Torrentio/);
    });

    it("ignores non-movie/series queries or invalid IMDb IDs", async () => {
      const client = new TorrentioClient({} as HttpDataClient);
      const parser = new TorrentioParser();
      const provider = new TorrentioProvider({ client, parser });

      const streams = await provider.getStreams(
        { type: "other" as any, id: "tt0068646" },
        new AbortController().signal,
      );

      assert.deepEqual(streams, []);
    });

    it("resolves Torrentio torrent candidates via candidate resolver", async () => {
      const fakeHttpClient = {
        async getJson<T>(): Promise<T> {
          return torrentioFixture as T;
        },
      } as unknown as HttpDataClient;

      const fakeResolver: TorrentCandidateResolver = {
        async resolve(candidate: TorrentCandidateResolutionRequest) {
          if (candidate.infoHash === "0123456789abcdef0123456789abcdef01234567") {
            return {
              url: "https://debrid.example.com/stream/godfather.mkv",
              filename: "godfather.mkv",
              filesize: 2_800_000_000,
              source: "authorized-resolver",
            };
          }
          return null;
        },
      };

      const client = new TorrentioClient(fakeHttpClient);
      const parser = new TorrentioParser();
      const provider = new TorrentioProvider({ client, parser, resolver: fakeResolver });

      const manager = new ProviderManager();
      manager.register(provider);
      const service = new StreamService(manager);

      const streams = await service.getStreams("movie", "tt0068646");
      assert.equal(streams.length, 2);
      assert.equal(streams[0]?.url, "https://debrid.example.com/stream/godfather.mkv");
      assert.equal(streams[1]?.url, "https://vjs.zencdn.net/v/oceans.mp4");
    });
  });
});
