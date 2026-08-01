import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { FixtureDataClient } from "../src/providers/fixture/fixtureDataClient.js";
import { FixtureParser } from "../src/providers/fixture/fixtureParser.js";
import { FixtureProvider } from "../src/providers/fixture/fixtureProvider.js";
import { ProviderManager } from "../src/services/providerManager.js";
import { StreamService } from "../src/services/streamService.js";

const fixturePath = fileURLToPath(new URL("./fixtures/provider-sample.json", import.meta.url));
const movieQuery = { type: "movie", id: "tt0111161" } as const;

describe("FixtureDataClient", () => {
  it("reads the local fixture without network access", async () => {
    const client = new FixtureDataClient(fixturePath);
    const rawData = await client.fetch(movieQuery, new AbortController().signal);

    assert.match(rawData, /The Shawshank Redemption/);
  });

  it("respects an aborted signal", async () => {
    const client = new FixtureDataClient(fixturePath);
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(() => client.fetch(movieQuery, controller.signal), { name: "AbortError" });
  });
});

describe("FixtureParser", () => {
  it("parses valid records and discards invalid entries", async () => {
    const rawData = await readFile(fixturePath, "utf8");
    const candidates = new FixtureParser().parse(rawData);

    assert.equal(candidates.length, 3);
    assert.deepEqual(candidates[0], {
      type: "movie",
      id: "tt0111161",
      title: "The Shawshank Redemption",
      quality: "1080p",
      language: "Português",
      url: "https://example.com/fixtures/tt0111161-1080p.mp4",
    });
  });

  it("returns no candidates when the streams collection is absent", () => {
    assert.deepEqual(new FixtureParser().parse('{"other":[]}'), []);
  });
});

describe("FixtureProvider", () => {
  const provider = new FixtureProvider(
    new FixtureDataClient(fixturePath),
    new FixtureParser(),
  );

  it("maps matching candidates to internal StreamResult values", async () => {
    const streams = await provider.getStreams(movieQuery, new AbortController().signal);

    assert.equal(streams.length, 2);
    assert.deepEqual(streams[0], {
      name: "Fixture Provider",
      title: "The Shawshank Redemption | 1080p | Português",
      url: "https://example.com/fixtures/tt0111161-1080p.mp4",
    });
  });

  it("propagates cancellation to the fixture client", async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(() => provider.getStreams(movieQuery, controller.signal), {
      name: "AbortError",
    });
  });

  it("works through ProviderManager", async () => {
    const manager = new ProviderManager();
    manager.register(provider);

    const streams = await manager.getStreamsFromAll(movieQuery);

    assert.equal(streams.length, 2);
    assert.equal(streams[1]?.title, "The Shawshank Redemption | 720p | English");
  });

  it("produces the final Stremio response through StreamService", async () => {
    const manager = new ProviderManager();
    manager.register(provider);

    const streams = await new StreamService(manager).getStreams("movie", "tt0111161");

    assert.equal(streams.length, 2);
    assert.deepEqual(streams[0], {
      name: "Fixture Provider",
      title: "The Shawshank Redemption | 1080p | Português",
      url: "https://example.com/fixtures/tt0111161-1080p.mp4",
    });
  });
});
