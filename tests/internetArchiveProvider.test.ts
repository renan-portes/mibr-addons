import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { HttpDataClient } from "../src/clients/http/httpDataClient.js";
import {
  HttpCancellationError,
  HttpInvalidJsonError,
  HttpStatusError,
  HttpTimeoutError,
} from "../src/clients/http/httpErrors.js";
import { InternetArchiveDataClient } from "../src/providers/internetArchive/internetArchiveDataClient.js";
import { isAcceptedInternetArchiveLicense } from "../src/providers/internetArchive/internetArchiveLicense.js";
import { InternetArchiveParser } from "../src/providers/internetArchive/internetArchiveParser.js";
import {
  InternetArchiveProvider,
  type InternetArchiveProviderOptions,
} from "../src/providers/internetArchive/internetArchiveProvider.js";
import { ProviderManager } from "../src/services/providerManager.js";
import { StreamService } from "../src/services/streamService.js";
import {
  startInternetArchiveTestServer,
  type InternetArchiveTestServer,
} from "./support/internetArchiveTestServer.js";

const fixtureDirectory = new URL("./fixtures/internet-archive/", import.meta.url);

async function readFixture(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(name, fixtureDirectory)), "utf8");
}

describe("InternetArchiveParser", () => {
  it("parses a minimal Advanced Search response", async () => {
    const items = new InternetArchiveParser().parseSearch(await readFixture("search.json").then(JSON.parse));

    assert.equal(items.length, 3);
    assert.deepEqual(items[0], {
      identifier: "public-domain-film-one",
      title: "Public Domain Film One",
      mediaType: "movies",
      externalIdentifiers: ["urn:imdb:tt0000001"],
    });
  });

  it("parses metadata and discards unsafe file names", async () => {
    const item = new InternetArchiveParser().parseMetadata(
      await readFixture("metadata-valid.json").then(JSON.parse),
    );

    assert.notEqual(item, null);
    assert.deepEqual(item?.externalIdentifiers, ["urn:imdb:tt0000001"]);
    assert.equal(item?.files.length, 8);
    assert.equal(item?.files.some((file) => file.name.includes("://")), false);
    assert.equal(item?.files.some((file) => file.name.includes("..")), false);
  });

  it("preserves an item that has no playable video for provider-level selection", async () => {
    const item = new InternetArchiveParser().parseMetadata(
      await readFixture("metadata-no-video.json").then(JSON.parse),
    );

    assert.equal(item?.identifier, "public-domain-film-no-video");
    assert.equal(item?.files.length, 2);
  });

  it("returns empty values for malformed API payloads", () => {
    const parser = new InternetArchiveParser();

    assert.deepEqual(parser.parseSearch({ response: { docs: "invalid" } }), []);
    assert.equal(parser.parseMetadata([]), null);
  });
});

describe("Internet Archive license validation", () => {
  for (const license of [
    "https://creativecommons.org/publicdomain/mark/1.0/",
    "http://creativecommons.org/publicdomain/mark/1.0",
    "https://www.creativecommons.org/publicdomain/zero/1.0/",
    "https://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "https://creativecommons.org/publicdomain/mark/1.0/deed.pt_BR/",
  ]) {
    it(`accepts official license URL: ${license}`, () => {
      assert.equal(isAcceptedInternetArchiveLicense(license), true);
    });
  }

  for (const license of [
    "https://creativecommons.org/publicdomain/zero/2.0/",
    "https://creativecommons.org/publicdomain/zero/inventado",
    "https://creativecommons.org/publicdomain/mark/1.0/arbitrary",
    "https://creativecommons.example/publicdomain/zero/1.0/",
    "https://creativecommons.org.evil.example/publicdomain/mark/1.0/",
    "https://creativecommons.org:444/publicdomain/zero/1.0/",
  ]) {
    it(`rejects ambiguous license URL: ${license}`, () => {
      assert.equal(isAcceptedInternetArchiveLicense(license), false);
    });
  }
});

describe("InternetArchiveProvider", () => {
  let testServer: InternetArchiveTestServer;
  let searchPayload: string;
  let validMetadata: string;
  let noVideoMetadata: string;
  let metadataByIdentifier: Record<string, string>;

  before(async () => {
    [searchPayload, validMetadata, noVideoMetadata] = await Promise.all([
      readFixture("search.json"),
      readFixture("metadata-valid.json"),
      readFixture("metadata-no-video.json"),
    ]);
    metadataByIdentifier = {
      "public-domain-film-one": validMetadata,
      "public-domain-film-no-video": noVideoMetadata,
    };
    testServer = await startInternetArchiveTestServer({
      searchPayload,
      metadataByIdentifier,
    });
  });

  after(async () => {
    await testServer.close();
  });

  function createProvider(
    searchMode = "success",
    httpClient: HttpDataClient = new HttpDataClient(),
    providerOptions: InternetArchiveProviderOptions = {},
  ): InternetArchiveProvider {
    const client = new InternetArchiveDataClient(httpClient, {
      searchUrl: `${testServer.baseUrl}/advancedsearch.php?mode=${searchMode}`,
      metadataBaseUrl: `${testServer.baseUrl}/metadata/`,
    });

    return new InternetArchiveProvider(client, new InternetArchiveParser(), providerOptions);
  }

  async function withMetadata(
    mutate: (metadata: Record<string, unknown>) => void,
    run: () => Promise<void>,
  ): Promise<void> {
    const parsed = JSON.parse(validMetadata) as { metadata: Record<string, unknown> };
    mutate(parsed.metadata);
    metadataByIdentifier["public-domain-film-one"] = JSON.stringify(parsed);

    try {
      await run();
    } finally {
      metadataByIdentifier["public-domain-film-one"] = validMetadata;
    }
  }

  async function withFiles(
    files: unknown[],
    run: () => Promise<void>,
  ): Promise<void> {
    const parsed = JSON.parse(validMetadata) as { files: unknown[] };
    parsed.files = files;
    metadataByIdentifier["public-domain-film-one"] = JSON.stringify(parsed);

    try {
      await run();
    } finally {
      metadataByIdentifier["public-domain-film-one"] = validMetadata;
    }
  }

  it("constructs the documented Advanced Search URL", async () => {
    const client = new InternetArchiveDataClient(new HttpDataClient(), {
      searchUrl: `${testServer.baseUrl}/advancedsearch.php`,
      metadataBaseUrl: `${testServer.baseUrl}/metadata/`,
    });

    await client.searchMoviesByImdbId("tt0000001", new AbortController().signal);
    assert.notEqual(testServer.lastRequestUrl, undefined);
    const requestUrl = new URL(testServer.lastRequestUrl ?? "", testServer.baseUrl);

    assert.equal(
      requestUrl.searchParams.get("q"),
      'external-identifier:"urn:imdb:tt0000001" AND mediatype:movies',
    );
    assert.deepEqual(requestUrl.searchParams.getAll("fl[]"), [
      "identifier",
      "title",
      "mediatype",
      "external-identifier",
    ]);
    assert.equal(requestUrl.searchParams.get("rows"), "10");
    assert.equal(requestUrl.searchParams.get("page"), "1");
    assert.equal(requestUrl.searchParams.get("output"), "json");
  });

  it("returns a public-domain movie with the preferred playable file", async () => {
    const streams = await createProvider().getStreams(
      { type: "movie", id: "tt0000001" },
      new AbortController().signal,
    );

    assert.deepEqual(streams, [
      {
        name: "Internet Archive",
        title: "Internet Archive | Public Domain Film One | MP4 1080p",
        url: "https://archive.org/download/public-domain-film-one/film-1080p.mp4",
      },
    ]);
  });

  it("deduplicates files and prefers MP4 quality over WebM", async () => {
    const streams = await createProvider().getStreams(
      { type: "movie", id: "tt0000001" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.match(streams[0]?.title ?? "", /MP4 1080p$/);
    assert.doesNotMatch(streams[0]?.url ?? "", /webm|480p/);
  });

  it("returns no stream when the item has no video file", async () => {
    const streams = await createProvider().getStreams(
      { type: "movie", id: "tt0000002" },
      new AbortController().signal,
    );

    assert.deepEqual(streams, []);
  });

  it("does not return a search result with a different exact IMDb identifier", async () => {
    const streams = await createProvider().getStreams(
      { type: "movie", id: "tt0000003" },
      new AbortController().signal,
    );

    assert.deepEqual(streams, []);
  });

  it("discards metadata without an IMDb identifier", async () => {
    await withMetadata(
      (metadata) => {
        delete metadata["external-identifier"];
      },
      async () => {
        const streams = await createProvider().getStreams(
          { type: "movie", id: "tt0000001" },
          new AbortController().signal,
        );
        assert.deepEqual(streams, []);
      },
    );
  });

  it("discards metadata with a different IMDb identifier", async () => {
    await withMetadata(
      (metadata) => {
        metadata["external-identifier"] = "urn:imdb:tt9999999";
      },
      async () => {
        const streams = await createProvider().getStreams(
          { type: "movie", id: "tt0000001" },
          new AbortController().signal,
        );
        assert.deepEqual(streams, []);
      },
    );
  });

  it("accepts multiple metadata identifiers containing the exact IMDb identifier", async () => {
    await withMetadata(
      (metadata) => {
        metadata["external-identifier"] = ["urn:other:value", "urn:imdb:tt0000001"];
      },
      async () => {
        const streams = await createProvider().getStreams(
          { type: "movie", id: "tt0000001" },
          new AbortController().signal,
        );
        assert.equal(streams.length, 1);
      },
    );
  });

  it("discards multiple metadata identifiers without the exact IMDb identifier", async () => {
    await withMetadata(
      (metadata) => {
        metadata["external-identifier"] = ["urn:other:value", "urn:imdb:tt9999999"];
      },
      async () => {
        const streams = await createProvider().getStreams(
          { type: "movie", id: "tt0000001" },
          new AbortController().signal,
        );
        assert.deepEqual(streams, []);
      },
    );
  });

  it("rejects an item without an accepted public-domain declaration", async () => {
    await withMetadata(
      (metadata) => {
        metadata.licenseurl = "https://example.com/custom-license";
      },
      async () => {
        const streams = await createProvider().getStreams(
          { type: "movie", id: "tt0000001" },
          new AbortController().signal,
        );
        assert.deepEqual(streams, []);
      },
    );
  });

  function videoFile(size?: unknown, name = "candidate.mp4"): Record<string, unknown> {
    return {
      name,
      format: "MPEG4",
      height: "720",
      ...(size === undefined ? {} : { size }),
    };
  }

  it("discards a video below the configured minimum size", async () => {
    await withFiles([videoFile("99")], async () => {
      const streams = await createProvider("success", new HttpDataClient(), {
        minVideoFileSizeBytes: 100,
      }).getStreams({ type: "movie", id: "tt0000001" }, new AbortController().signal);
      assert.deepEqual(streams, []);
    });
  });

  it("accepts a video exactly at the configured minimum size", async () => {
    await withFiles([videoFile("100")], async () => {
      const streams = await createProvider("success", new HttpDataClient(), {
        minVideoFileSizeBytes: 100,
      }).getStreams({ type: "movie", id: "tt0000001" }, new AbortController().signal);
      assert.equal(streams.length, 1);
    });
  });

  it("accepts a video above the configured minimum size", async () => {
    await withFiles([videoFile("101")], async () => {
      const streams = await createProvider("success", new HttpDataClient(), {
        minVideoFileSizeBytes: 100,
      }).getStreams({ type: "movie", id: "tt0000001" }, new AbortController().signal);
      assert.equal(streams.length, 1);
    });
  });

  it("discards a video without size", async () => {
    await withFiles([videoFile()], async () => {
      const streams = await createProvider("success", new HttpDataClient(), {
        minVideoFileSizeBytes: 100,
      }).getStreams({ type: "movie", id: "tt0000001" }, new AbortController().signal);
      assert.deepEqual(streams, []);
    });
  });

  it("discards a video with invalid size", async () => {
    await withFiles([videoFile("invalid")], async () => {
      const streams = await createProvider("success", new HttpDataClient(), {
        minVideoFileSizeBytes: 100,
      }).getStreams({ type: "movie", id: "tt0000001" }, new AbortController().signal);
      assert.deepEqual(streams, []);
    });
  });

  it("selects the only file that passes the minimum size", async () => {
    await withFiles(
      [videoFile("99", "too-small.mp4"), videoFile("100", "large-enough.mp4")],
      async () => {
        const streams = await createProvider("success", new HttpDataClient(), {
          minVideoFileSizeBytes: 100,
        }).getStreams({ type: "movie", id: "tt0000001" }, new AbortController().signal);
        assert.equal(streams.length, 1);
        assert.match(streams[0]?.url ?? "", /large-enough\.mp4$/);
      },
    );
  });

  it("returns no stream when no file passes the minimum size", async () => {
    await withFiles([videoFile("98"), videoFile("99", "other.mp4")], async () => {
      const streams = await createProvider("success", new HttpDataClient(), {
        minVideoFileSizeBytes: 100,
      }).getStreams({ type: "movie", id: "tt0000001" }, new AbortController().signal);
      assert.deepEqual(streams, []);
    });
  });

  it("deduplicates two search documents that resolve to the same URL", async () => {
    const duplicateSearch = JSON.parse(searchPayload) as {
      response: { docs: Array<Record<string, unknown>> };
    };
    duplicateSearch.response.docs.unshift({ ...duplicateSearch.response.docs[0] });
    const duplicateServer = await startInternetArchiveTestServer({
      searchPayload: JSON.stringify(duplicateSearch),
      metadataByIdentifier,
    });

    try {
      const client = new InternetArchiveDataClient(new HttpDataClient(), {
        searchUrl: `${duplicateServer.baseUrl}/advancedsearch.php`,
        metadataBaseUrl: `${duplicateServer.baseUrl}/metadata/`,
      });
      const provider = new InternetArchiveProvider(client, new InternetArchiveParser());
      const streams = await provider.getStreams(
        { type: "movie", id: "tt0000001" },
        new AbortController().signal,
      );

      assert.equal(streams.length, 1);
      assert.equal(duplicateServer.requestCount, 3);
    } finally {
      await duplicateServer.close();
    }
  });

  for (const status of [404, 500] as const) {
    it(`propagates HTTP ${status} as a typed error`, async () => {
      await assert.rejects(
        () =>
          createProvider(String(status)).getStreams(
            { type: "movie", id: "tt0000001" },
            new AbortController().signal,
          ),
        (error: unknown) => error instanceof HttpStatusError && error.status === status,
      );
    });
  }

  it("propagates invalid JSON as a typed error", async () => {
    await assert.rejects(
      () =>
        createProvider("invalid-json").getStreams(
          { type: "movie", id: "tt0000001" },
          new AbortController().signal,
        ),
      HttpInvalidJsonError,
    );
  });

  it("times out a slow API response", async () => {
    await assert.rejects(
      () =>
        createProvider("slow", new HttpDataClient({ timeoutMs: 20 })).getStreams(
          { type: "movie", id: "tt0000001" },
          new AbortController().signal,
        ),
      HttpTimeoutError,
    );
  });

  it("respects external cancellation", async () => {
    const controller = new AbortController();
    const request = createProvider("slow").getStreams(
      { type: "movie", id: "tt0000001" },
      controller.signal,
    );
    controller.abort();

    await assert.rejects(() => request, HttpCancellationError);
  });

  it("ignores series without accessing the API", async () => {
    const requestCount = testServer.requestCount;
    const streams = await createProvider().getStreams(
      { type: "series", id: "tt0000001:1:1" },
      new AbortController().signal,
    );

    assert.deepEqual(streams, []);
    assert.equal(testServer.requestCount, requestCount);
  });

  it("integrates with ProviderManager", async () => {
    const manager = new ProviderManager();
    manager.register(createProvider());

    const streams = await manager.getStreamsFromAll({ type: "movie", id: "tt0000001" });

    assert.equal(streams.length, 1);
    assert.equal(streams[0]?.name, "Internet Archive");
  });

  it("integrates through StreamService and the Stremio adapter", async () => {
    const manager = new ProviderManager();
    manager.register(createProvider());

    const streams = await new StreamService(manager).getStreams("movie", "tt0000001");

    assert.deepEqual(streams, [
      {
        name: "Internet Archive",
        title: "Internet Archive | Public Domain Film One | MP4 1080p",
        url: "https://archive.org/download/public-domain-film-one/film-1080p.mp4",
      },
    ]);
  });
});
