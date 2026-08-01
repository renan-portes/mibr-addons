import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { HttpDataClient } from "../src/clients/http/httpDataClient.js";
import {
  HttpCancellationError,
  HttpInvalidJsonError,
  HttpStatusError,
  HttpTimeoutError,
} from "../src/clients/http/httpErrors.js";
import { HttpFixtureParser } from "../src/providers/httpFixture/httpFixtureParser.js";
import {
  HttpFixtureProvider,
  type HttpFixtureEndpoints,
} from "../src/providers/httpFixture/httpFixtureProvider.js";
import { ProviderManager } from "../src/services/providerManager.js";
import { StreamService } from "../src/services/streamService.js";
import {
  startHttpFixtureTestServer,
  type HttpFixtureTestServer,
} from "./support/httpFixtureTestServer.js";

describe("HttpFixtureParser", () => {
  it("validates and normalizes candidates without I/O", () => {
    const candidates = new HttpFixtureParser().parse({
      streams: [
        {
          type: "movie",
          id: " tt1234567 ",
          title: " Example Movie ",
          quality: " 1080p ",
          language: " Português ",
          url: " https://example.com/movie.mp4 ",
        },
        {
          type: "movie",
          id: "tt1234567",
          title: "Missing URL",
          quality: "720p",
          language: "English",
        },
        null,
      ],
    });

    assert.deepEqual(candidates, [
      {
        type: "movie",
        id: "tt1234567",
        title: "Example Movie",
        quality: "1080p",
        language: "Português",
        url: "https://example.com/movie.mp4",
      },
    ]);
  });

  it("returns an empty result for an invalid payload", () => {
    assert.deepEqual(new HttpFixtureParser().parse(null), []);
    assert.deepEqual(new HttpFixtureParser().parse({ streams: "invalid" }), []);
  });
});

describe("HttpFixtureProvider", () => {
  let testServer: HttpFixtureTestServer;

  before(async () => {
    testServer = await startHttpFixtureTestServer();
  });

  after(async () => {
    await testServer.close();
  });

  function createEndpoints(movieMode = "success", seriesMode = "success"): HttpFixtureEndpoints {
    return {
      movie: `${testServer.baseUrl}/movies.json?mode=${movieMode}`,
      series: `${testServer.baseUrl}/series.json?mode=${seriesMode}`,
    };
  }

  function createProvider(
    endpoints: HttpFixtureEndpoints = createEndpoints(),
    client: HttpDataClient = new HttpDataClient(),
  ): HttpFixtureProvider {
    return new HttpFixtureProvider(client, new HttpFixtureParser(), endpoints);
  }

  it("serves movie and series fixtures over the local HTTP server", async () => {
    const client = new HttpDataClient();
    const movies = await client.getJson(`${testServer.baseUrl}/movies.json`);
    const series = await client.getJson(`${testServer.baseUrl}/series.json`);

    assert.equal(Array.isArray((movies as { streams: unknown[] }).streams), true);
    assert.equal(Array.isArray((series as { streams: unknown[] }).streams), true);
  });

  it("returns movie results in their source order and internal format", async () => {
    const streams = await createProvider().getStreams(
      { type: "movie", id: "tt0111161" },
      new AbortController().signal,
    );

    assert.deepEqual(streams, [
      {
        name: "HTTP Fixture Provider",
        title: "The Shawshank Redemption | 1080p | Português",
        url: "https://example.com/http/tt0111161-1080p.mp4",
      },
      {
        name: "HTTP Fixture Provider",
        title: "The Shawshank Redemption | 720p | English",
        url: "https://example.com/http/tt0111161-720p.mp4",
      },
    ]);
  });

  it("returns a matching series result", async () => {
    const streams = await createProvider().getStreams(
      { type: "series", id: "tt0903747:1:1" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.equal(streams[0]?.title, "Breaking Bad S01E01 | 1080p | Português");
  });

  it("filters results by id", async () => {
    const streams = await createProvider().getStreams(
      { type: "movie", id: "tt0068646" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.match(streams[0]?.title ?? "", /The Godfather/);
  });

  it("filters results by media type", async () => {
    const streams = await createProvider().getStreams(
      { type: "movie", id: "tt0111161" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 2);
    assert.equal(streams.some((stream) => stream.title.includes("Wrong media type")), false);
  });

  it("returns no results for an empty response", async () => {
    const streams = await createProvider(createEndpoints("empty")).getStreams(
      { type: "movie", id: "tt0111161" },
      new AbortController().signal,
    );

    assert.deepEqual(streams, []);
  });

  for (const status of [404, 500] as const) {
    it(`propagates HTTP ${status} as a typed error`, async () => {
      const provider = createProvider(createEndpoints(String(status)));

      await assert.rejects(
        () =>
          provider.getStreams(
            { type: "movie", id: "tt0111161" },
            new AbortController().signal,
          ),
        (error: unknown) => error instanceof HttpStatusError && error.status === status,
      );
    });
  }

  it("propagates invalid JSON as a typed error", async () => {
    const provider = createProvider(createEndpoints("invalid-json"));

    await assert.rejects(
      () =>
        provider.getStreams(
          { type: "movie", id: "tt0111161" },
          new AbortController().signal,
        ),
      HttpInvalidJsonError,
    );
  });

  it("times out a slow HTTP response", async () => {
    const provider = createProvider(
      createEndpoints("slow"),
      new HttpDataClient({ timeoutMs: 20 }),
    );

    await assert.rejects(
      () =>
        provider.getStreams(
          { type: "movie", id: "tt0111161" },
          new AbortController().signal,
        ),
      HttpTimeoutError,
    );
  });

  it("respects external cancellation", async () => {
    const provider = createProvider(createEndpoints("slow"));
    const controller = new AbortController();
    const request = provider.getStreams({ type: "movie", id: "tt0111161" }, controller.signal);
    controller.abort();

    await assert.rejects(() => request, HttpCancellationError);
  });

  it("integrates with ProviderManager", async () => {
    const manager = new ProviderManager();
    manager.register(createProvider());

    const streams = await manager.getStreamsFromAll({ type: "movie", id: "tt0111161" });

    assert.equal(streams.length, 2);
    assert.equal(streams[0]?.name, "HTTP Fixture Provider");
  });

  it("integrates through StreamService and the Stremio adapter", async () => {
    const manager = new ProviderManager();
    manager.register(createProvider());

    const streams = await new StreamService(manager).getStreams("series", "tt0903747:1:1");

    assert.deepEqual(streams, [
      {
        name: "HTTP Fixture Provider",
        title: "Breaking Bad S01E01 | 1080p | Português",
        url: "https://example.com/http/tt0903747-s01e01.mp4",
      },
    ]);
  });
});
