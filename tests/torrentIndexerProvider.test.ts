import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, describe, it } from "node:test";
import { HttpDataClient } from "../src/clients/http/httpDataClient.js";
import {
  HttpCancellationError,
  HttpInvalidJsonError,
  HttpResponseTooLargeError,
  HttpStatusError,
  HttpTimeoutError,
} from "../src/clients/http/httpErrors.js";
import { TorrentIndexerDataClient } from "../src/providers/torrentIndexer/torrentIndexerDataClient.js";
import { TorrentIndexerParser } from "../src/providers/torrentIndexer/torrentIndexerParser.js";
import { TorrentIndexerProvider } from "../src/providers/torrentIndexer/torrentIndexerProvider.js";
import type {
  TorrentIndexerRawResponse,
  TorrentIndexerRequest,
} from "../src/providers/torrentIndexer/torrentIndexerTypes.js";
import { ProviderManager } from "../src/services/providerManager.js";
import { StreamService } from "../src/services/streamService.js";
import type { DataClient } from "../src/types/dataClient.js";
import type { StreamProvider } from "../src/types/streamProvider.js";
import {
  startTorrentIndexerTestServer,
  type TorrentIndexerTestServer,
} from "./support/torrentIndexerTestServer.js";

const VALID_ITEM = {
  title: " Example Release ",
  original_title: "Example",
  details: "https://indexer.invalid/items/example",
  year: "2024",
  imdb: "https://www.imdb.com/title/tt0000001",
  audio: ["Português", "English"],
  magnet_link: "magnet:?xt=urn:btih:0000000000000000000000000000000000000000",
  info_hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  trackers: ["udp://tracker.invalid:80/announce"],
  size: "2 GB",
  files: [{ path: "Example.mkv", size: "2 GB" }],
  seed_count: 3,
  leech_count: 1,
};

describe("TorrentIndexerDataClient", () => {
  let server: TorrentIndexerTestServer;

  before(async () => {
    server = await startTorrentIndexerTestServer();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.setMode("valid");
    server.requests.length = 0;
  });

  function createClient(
    indexer = "bludv",
    httpClient = new HttpDataClient(),
    allowedIndexers: readonly string[] = ["bludv", "comando_torrents"],
  ): TorrentIndexerDataClient {
    return new TorrentIndexerDataClient(httpClient, {
      baseUrl: `${server.baseUrl}api/`,
      indexer,
      allowedIndexers,
    });
  }

  it("builds the endpoint and encodes every supported query parameter", async () => {
    await createClient().fetch(
      {
        q: "ação & filme/2024",
        filterResults: true,
        limit: 25,
        sortBy: "seed_count",
        sortDirection: "desc",
        audio: ["por", "eng"],
        year: "2024",
        imdb: "tt0000001",
      },
      new AbortController().signal,
    );

    assert.deepEqual(server.requests[0], {
      pathname: "/api/indexers/bludv",
      searchParams: {
        q: "ação & filme/2024",
        filter_results: "true",
        limit: "25",
        sortBy: "seed_count",
        sortDirection: "desc",
        audio: "por,eng",
        year: "2024",
        imdb: "tt0000001",
      },
    });
  });

  it("allows only explicitly configured indexers", () => {
    assert.throws(() => createClient("unknown"), /not allowed/);
  });

  for (const indexer of ["../bludv", "bludv/other", "BluDV", "bludv?x=1"]) {
    it(`rejects an unsafe indexer name: ${indexer}`, () => {
      assert.throws(() => createClient(indexer, new HttpDataClient(), [indexer]), /Invalid/);
    });
  }

  for (const status of [404, 500] as const) {
    it(`propagates HTTP ${status}`, async () => {
      server.setMode(String(status) as "404" | "500");
      await assert.rejects(
        () => createClient().fetch({}, new AbortController().signal),
        (error: unknown) => error instanceof HttpStatusError && error.status === status,
      );
    });
  }

  it("propagates invalid JSON", async () => {
    server.setMode("invalid-json");
    await assert.rejects(
      () => createClient().fetch({}, new AbortController().signal),
      HttpInvalidJsonError,
    );
  });

  it("times out a slow response", async () => {
    server.setMode("slow");
    await assert.rejects(
      () =>
        createClient("bludv", new HttpDataClient({ timeoutMs: 20 })).fetch(
          {},
          new AbortController().signal,
        ),
      HttpTimeoutError,
    );
  });

  it("respects external cancellation", async () => {
    server.setMode("slow");
    const controller = new AbortController();
    const request = createClient().fetch({}, controller.signal);
    controller.abort();
    await assert.rejects(() => request, HttpCancellationError);
  });

  it("enforces the generic HTTP response size limit", async () => {
    server.setMode("large");
    await assert.rejects(
      () =>
        createClient("bludv", new HttpDataClient({ maxResponseBytes: 256 })).fetch(
          {},
          new AbortController().signal,
        ),
      HttpResponseTooLargeError,
    );
  });

  for (const [mode, expectedItems] of [
    ["partial", 1],
    ["missing-results", 0],
    ["wrong-results", 0],
  ] as const) {
    it(`serves and defensively parses the local ${mode} response`, async () => {
      server.setMode(mode);
      const payload = await createClient().fetch({}, new AbortController().signal);
      assert.equal(new TorrentIndexerParser().parse(payload).items.length, expectedItems);
    });
  }
});

describe("TorrentIndexerParser", () => {
  const parser = new TorrentIndexerParser();

  it("parses the approved synthetic valid fixture", async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL("./fixtures/torrent-indexer/valid-response.json", import.meta.url),
        "utf8",
      ),
    ) as unknown;
    const parsed = parser.parse(fixture);

    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.count, 1);
    assert.equal(parsed.indexedCount, 1);
    assert.equal(parsed.items[0]?.imdb, "tt0000001");
    assert.equal(parsed.items[0]?.infoHash, "0000000000000000000000000000000000000000");
  });

  it("accepts missing optional fields", () => {
    assert.deepEqual(parser.parse({ results: [{ title: "Minimal" }] }).items, [
      { title: "Minimal", audio: [], trackers: [], files: [], peers: {} },
    ]);
  });

  it("returns no items for a missing or wrongly typed results field", () => {
    assert.deepEqual(parser.parse({ count: 0 }), { items: [] });
    assert.deepEqual(parser.parse({ results: "invalid" }), { items: [] });
  });

  for (const [label, override] of [
    ["empty title", { title: " " }],
    ["invalid hash", { info_hash: "not-a-hash" }],
    ["negative seeders", { seed_count: -1 }],
    ["invalid IMDb", { imdb: "tt12" }],
  ] as const) {
    it(`discards an item with ${label}`, () => {
      assert.deepEqual(parser.parse({ results: [{ ...VALID_ITEM, ...override }] }).items, []);
    });
  }

  it("normalizes hashes and safely filters mixed arrays", () => {
    const item = parser.parse({
      results: [
        {
          ...VALID_ITEM,
          audio: ["Português", 7, " ", "English"],
          trackers: ["udp://tracker.invalid", null, 3],
          files: [
            { path: "video.mkv", size: "1 GB", unknown: true },
            { path: "" },
            null,
            "invalid",
          ],
          unknown_field: { ignored: true },
        },
      ],
    }).items[0];

    assert.equal(item?.infoHash, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.deepEqual(item?.audio, ["Português", "English"]);
    assert.deepEqual(item?.trackers, ["udp://tracker.invalid"]);
    assert.deepEqual(item?.files, [{ path: "video.mkv", size: "1 GB" }]);
    assert.equal("unknown_field" in (item ?? {}), false);
  });

  it("ignores malformed optional magnet, audio and files without failing the item", () => {
    const item = parser.parse({
      results: [{ title: "Safe", magnet_link: "https://evil.invalid", audio: {}, files: {} }],
    }).items[0];
    assert.equal(item?.magnet, undefined);
    assert.deepEqual(item?.audio, []);
    assert.deepEqual(item?.files, []);
  });

  it("keeps valid entries when other results are invalid", () => {
    const parsed = parser.parse({ results: [null, { title: "" }, VALID_ITEM, 42] });
    assert.equal(parsed.items.length, 1);
  });
});

describe("TorrentIndexerProvider", () => {
  class RecordingClient
    implements DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse>
  {
    readonly requests: TorrentIndexerRequest[] = [];
    constructor(private readonly response: TorrentIndexerRawResponse) {}
    async fetch(request: TorrentIndexerRequest, _signal: AbortSignal): Promise<unknown> {
      this.requests.push(request);
      return this.response;
    }
  }

  function createProvider(client: RecordingClient): TorrentIndexerProvider {
    return new TorrentIndexerProvider(client, new TorrentIndexerParser(), { indexer: "bludv" });
  }

  it("queries movies by the complete ID and IMDb base", async () => {
    const client = new RecordingClient({ results: [VALID_ITEM] });
    assert.deepEqual(
      await createProvider(client).getStreams(
        { type: "movie", id: "tt0000001" },
        new AbortController().signal,
      ),
      [],
    );
    assert.deepEqual(client.requests, [
      { q: "tt0000001", imdb: "tt0000001", filterResults: true },
    ]);
  });

  it("preserves the complete series ID while filtering by the IMDb base", async () => {
    const client = new RecordingClient({ results: [VALID_ITEM] });
    await createProvider(client).getStreams(
      { type: "series", id: "tt0000001:2:3" },
      new AbortController().signal,
    );
    assert.deepEqual(client.requests[0], {
      q: "tt0000001:2:3",
      imdb: "tt0000001",
      filterResults: true,
    });
  });

  it("returns no result for empty or invalid discovery responses", async () => {
    for (const response of [{ results: [] }, { results: [{ title: "" }] }]) {
      assert.deepEqual(
        await createProvider(new RecordingClient(response)).getStreams(
          { type: "movie", id: "tt0000001" },
          new AbortController().signal,
        ),
        [],
      );
    }
  });

  it("never exposes a magnet as a playback URL", async () => {
    const streams = await createProvider(new RecordingClient({ results: [VALID_ITEM] })).getStreams(
      { type: "movie", id: "tt0000001" },
      new AbortController().signal,
    );
    assert.deepEqual(streams, []);
  });

  it("integrates with ProviderManager and StreamService in discovery-only mode", async () => {
    const manager = new ProviderManager();
    manager.register(createProvider(new RecordingClient({ results: [VALID_ITEM] })));
    assert.deepEqual(
      await manager.getStreamsFromAll({ type: "movie", id: "tt0000001" }),
      [],
    );
    assert.deepEqual(await new StreamService(manager).getStreams("movie", "tt0000001"), []);
  });

  it("runs the complete local HTTP pipeline through StreamService", async () => {
    const server = await startTorrentIndexerTestServer();

    try {
      const client = new TorrentIndexerDataClient(new HttpDataClient(), {
        baseUrl: server.baseUrl,
        indexer: "bludv",
        allowedIndexers: ["bludv"],
      });
      const manager = new ProviderManager();
      manager.register(
        new TorrentIndexerProvider(client, new TorrentIndexerParser(), { indexer: "bludv" }),
      );

      assert.deepEqual(await new StreamService(manager).getStreams("movie", "tt0000001"), []);
      assert.equal(server.requests[0]?.pathname, "/indexers/bludv");
      assert.equal(server.requests[0]?.searchParams.q, "tt0000001");
      assert.equal(server.requests[0]?.searchParams.imdb, "tt0000001");
    } finally {
      await server.close();
    }
  });

  it("isolates its failure while another provider remains healthy", async () => {
    const failingClient: DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse> = {
      async fetch() {
        throw new Error("synthetic failure without sensitive data");
      },
    };
    const failing = new TorrentIndexerProvider(failingClient, new TorrentIndexerParser(), {
      indexer: "bludv",
    });
    const healthy: StreamProvider = {
      id: "healthy",
      name: "healthy",
      async getStreams() {
        return [{ name: "healthy", title: "Synthetic stream", url: "https://example.com/video.mp4" }];
      },
    };
    const manager = new ProviderManager();
    manager.register(failing);
    manager.register(healthy);
    assert.deepEqual(await manager.getStreamsFromAll({ type: "movie", id: "tt0000001" }), [
      { name: "healthy", title: "Synthetic stream", url: "https://example.com/video.mp4" },
    ]);
  });
});
