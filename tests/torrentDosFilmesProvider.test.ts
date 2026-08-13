import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { HttpDataClient } from "../src/clients/http/httpDataClient.js";
import { TorrentDosFilmesClient } from "../src/providers/torrentdosfilmes/torrentDosFilmesClient.js";
import { TorrentDosFilmesParser } from "../src/providers/torrentdosfilmes/torrentDosFilmesParser.js";
import { TorrentDosFilmesProvider } from "../src/providers/torrentdosfilmes/torrentDosFilmesProvider.js";
import type { TorrentDosFilmesRawResponse } from "../src/providers/torrentdosfilmes/torrentDosFilmesTypes.js";
import type { TorrentCandidateResolutionRequest, TorrentCandidateResolver } from "../src/providers/torrentIndexer/torrentCandidateResolver.js";
import { ProviderManager } from "../src/services/providerManager.js";
import { StreamService } from "../src/services/streamService.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/torrentDosFilmesFixture.json", import.meta.url), "utf8"),
) as TorrentDosFilmesRawResponse;

describe("TorrentDosFilmes Provider", () => {
  describe("TorrentDosFilmesParser", () => {
    it("parses valid TorrentDosFilmes fixture", () => {
      const parser = new TorrentDosFilmesParser();
      const parsed = parser.parse(fixture);

      assert.equal(parsed.items.length, 2);
      assert.equal(parsed.items[0]?.infoHash, "0123456789abcdef0123456789abcdef01234567");
      assert.equal(parsed.items[1]?.quality, "4K");
    });

    it("handles invalid or non-object responses gracefully", () => {
      const parser = new TorrentDosFilmesParser();
      assert.deepEqual(parser.parse(null), { items: [], count: 0 });
      assert.deepEqual(parser.parse("invalid"), { items: [], count: 0 });
      assert.deepEqual(parser.parse({ results: "invalid" }), { items: [], count: 0 });
    });
  });

  describe("TorrentDosFilmesClient", () => {
    it("builds correct URL query path", async () => {
      let requestedUrl = "";
      const fakeHttpClient = {
        async getJson<T>(url: URL): Promise<T> {
          requestedUrl = url.toString();
          return { results: [] } as T;
        },
      } as unknown as HttpDataClient;

      const client = new TorrentDosFilmesClient(fakeHttpClient, {
        baseUrl: "https://indexer.example.com",
      });

      await client.fetch({ imdb: "tt1375666", limit: 5 }, new AbortController().signal);
      assert.equal(requestedUrl, "https://indexer.example.com/indexers/torrentdosfilmes?imdb=tt1375666&limit=5");
    });

    it("supports mock mode for local testing", async () => {
      const fakeHttpClient = {} as HttpDataClient;
      const client = new TorrentDosFilmesClient(fakeHttpClient, { baseUrl: "mock" });
      const result = await client.fetch({ imdb: "tt1375666" }, new AbortController().signal);

      assert.equal(typeof result, "object");
      assert.notEqual(result, null);
      assert.equal(Array.isArray((result as { results: unknown[] }).results), true);
    });
  });

  describe("TorrentDosFilmesProvider", () => {
    it("queries movie streams and maps PT-BR items to StreamResult", async () => {
      const fakeHttpClient = {
        async getJson<T>(): Promise<T> {
          return fixture as T;
        },
      } as unknown as HttpDataClient;

      const client = new TorrentDosFilmesClient(fakeHttpClient);
      const parser = new TorrentDosFilmesParser();
      const provider = new TorrentDosFilmesProvider({ client, parser });

      const streams = await provider.getStreams(
        { type: "movie", id: "tt1375666" },
        new AbortController().signal,
      );

      assert.equal(streams.length, 1);
      assert.match(streams[0]?.title ?? "", /Português \(Dublado\)/);
      assert.match(streams[0]?.name ?? "", /Torrent dos Filmes/);
    });

    it("ignores non-movie/series queries or invalid IMDb IDs", async () => {
      const client = new TorrentDosFilmesClient({} as HttpDataClient);
      const parser = new TorrentDosFilmesParser();
      const provider = new TorrentDosFilmesProvider({ client, parser });

      const streams = await provider.getStreams(
        { type: "other" as any, id: "tt1375666" },
        new AbortController().signal,
      );

      assert.deepEqual(streams, []);
    });

    it("resolves candidates via Real-Debrid candidate resolver", async () => {
      const fakeHttpClient = {
        async getJson<T>(): Promise<T> {
          return fixture as T;
        },
      } as unknown as HttpDataClient;

      const fakeResolver: TorrentCandidateResolver = {
        async resolve(candidate: TorrentCandidateResolutionRequest) {
          if (candidate.infoHash === "0123456789abcdef0123456789abcdef01234567") {
            return {
              url: "https://debrid.example.com/stream/inception.ptbr.mkv",
              filename: "inception.ptbr.mkv",
              filesize: 2_800_000_000,
              source: "authorized-resolver",
            };
          }
          return null;
        },
      };

      const client = new TorrentDosFilmesClient(fakeHttpClient);
      const parser = new TorrentDosFilmesParser();
      const provider = new TorrentDosFilmesProvider({ client, parser, resolver: fakeResolver });

      const manager = new ProviderManager();
      manager.register(provider);
      const service = new StreamService(manager);

      const streams = await service.getStreams("movie", "tt1375666");
      assert.equal(streams.length, 1);
      assert.equal(streams[0]?.url, "https://debrid.example.com/stream/inception.ptbr.mkv");
      assert.match(streams[0]?.name ?? "", /Torrent dos Filmes \(Real-Debrid PT-BR\)/);
    });
  });
});
