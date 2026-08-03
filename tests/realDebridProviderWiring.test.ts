import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { DataClient } from "../src/types/dataClient.js";
import { RealDebridApiClient, type RealDebridHttpTransport } from "../src/providers/torrentIndexer/realDebridApiClient.js";
import {
  createRealDebridProviderWiring,
  createRealDebridTorrentIndexerProvider,
  RealDebridProviderWiringError,
  type RealDebridProviderWiringDependencies,
} from "../src/providers/torrentIndexer/realDebridProviderWiring.js";
import { TorrentIndexerParser } from "../src/providers/torrentIndexer/torrentIndexerParser.js";
import type { TorrentIndexerRawResponse, TorrentIndexerRequest } from "../src/providers/torrentIndexer/torrentIndexerTypes.js";
import { FakeRealDebridTransport } from "./support/fakeRealDebridTransport.js";
import { createDeferred, FakeTorrentCandidateResolver } from "./support/fakeTorrentCandidateResolver.js";

const TOKEN = "synthetic-wiring-token-not-real";
const HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const QUERY = Object.freeze({ type: "movie" as const, id: "tt0000001" });
const RESPONSE = Object.freeze({ results: [Object.freeze({ title: "Synthetic", imdb: "tt0000001", info_hash: HASH,
  magnet_link: `magnet:?xt=urn:btih:${HASH}`, files: [Object.freeze({ path: "folder/video.mkv", size: "2 GB" })] })] });

class StaticClient implements DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse> {
  calls = 0;
  async fetch(): Promise<TorrentIndexerRawResponse> { this.calls += 1; return RESPONSE; }
}

function dependencies(resolver: FakeTorrentCandidateResolver, counters = { transport: 0, api: 0, resolver: 0 }): RealDebridProviderWiringDependencies {
  return {
    createTransport: () => { counters.transport += 1; return new FakeRealDebridTransport([]); },
    createApiClient: (transport, token) => { counters.api += 1; return new RealDebridApiClient(transport, token); },
    createResolver: () => { counters.resolver += 1; return resolver; },
  };
}

describe("Real-Debrid provider wiring", () => {
  it("constructs nothing while disabled and preserves discovery-only behavior", async () => {
    const counters = { transport: 0, api: 0, resolver: 0 };
    const client = new StaticClient();
    const provider = createRealDebridTorrentIndexerProvider(client, new TorrentIndexerParser(), { indexer: "synthetic" },
      { enabled: false }, dependencies(new FakeTorrentCandidateResolver([]), counters));
    assert.deepEqual(await provider.getStreams(QUERY, new AbortController().signal), []);
    assert.equal(client.calls, 1);
    assert.deepEqual(counters, { transport: 0, api: 0, resolver: 0 });
  });

  it("fails closed for truthy enabled values other than literal true before composition", () => {
    for (const enabled of [1, "true", {}, [], new Boolean(true)]) {
      const counters = { transport: 0, api: 0, resolver: 0 };
      assert.throws(() => createRealDebridProviderWiring(
        { enabled } as never,
        dependencies(new FakeTorrentCandidateResolver([]), counters),
      ), RealDebridProviderWiringError);
      assert.deepEqual(counters, { transport: 0, api: 0, resolver: 0 });
    }
  });

  it("rejects missing, empty, whitespace, control and invalid options before transport construction", () => {
    for (const config of [
      { enabled: true }, { enabled: true, token: "" }, { enabled: true, token: "   " }, { enabled: true, token: "bad\nvalue" },
      { enabled: true, token: TOKEN, candidateLimit: 0 }, { enabled: true, token: TOKEN, transportTimeoutMs: 60_001 },
    ]) {
      let transports = 0;
      assert.throws(() => createRealDebridProviderWiring(config as never, { createTransport: () => { transports += 1; return new FakeRealDebridTransport([]); } }),
        (error: unknown) => error instanceof RealDebridProviderWiringError && !error.message.includes(TOKEN));
      assert.equal(transports, 0);
    }
  });

  it("constructs transport, API and resolver exactly once without exposing its token", () => {
    const counters = { transport: 0, api: 0, resolver: 0 };
    const fake = new FakeTorrentCandidateResolver([]);
    const wiring = createRealDebridProviderWiring({ enabled: true, token: TOKEN, transportTimeoutMs: 10_000,
      pollAttempts: 3, totalTimeoutMs: 20_000, cleanupTimeoutMs: 2_000, candidateLimit: 3, resolverTimeoutMs: 5_000 },
    dependencies(fake, counters));
    assert.equal(wiring.resolver, fake);
    assert.deepEqual(wiring.resolution, { enabled: true, candidateLimit: 3, timeoutMs: 5_000 });
    assert.deepEqual(counters, { transport: 1, api: 1, resolver: 1 });
    let capturedApi: RealDebridApiClient | undefined;
    const concrete = createRealDebridProviderWiring({ enabled: true, token: TOKEN }, {
      createTransport: () => new FakeRealDebridTransport([]),
      createResolver: (api) => {
        capturedApi = api;
        return new FakeTorrentCandidateResolver([]);
      },
    });
    assert.ok(capturedApi);
    for (const value of [wiring, concrete, capturedApi]) {
      const publicNames = [Object.keys(value), Object.getOwnPropertyNames(value), Object.keys({ ...value })];
      for (const names of publicNames) assert.equal(names.some((name) => /token/i.test(name)), false);
      for (const publicView of [value, { ...value }]) {
        const serialized = JSON.stringify(publicView);
        assert.equal(serialized.includes(TOKEN), false);
        assert.equal(/token/i.test(serialized), false);
      }
    }
  });

  it("injects the resolver into TorrentIndexerProvider and propagates cancellation", async () => {
    const delayed = createDeferred<null>();
    const fake = new FakeTorrentCandidateResolver([delayed.promise]);
    const provider = createRealDebridTorrentIndexerProvider(new StaticClient(), new TorrentIndexerParser(), { indexer: "synthetic" },
      { enabled: true, token: TOKEN }, dependencies(fake));
    const controller = new AbortController();
    const pending = provider.getStreams(QUERY, controller.signal);
    while (fake.callCount === 0) await Promise.resolve();
    controller.abort();
    await assert.rejects(() => pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
    assert.equal(fake.callCount, 1);
    assert.equal(fake.requests[0]?.signal.aborted, true);
    delayed.resolve(null);
  });

  it("sanitizes arbitrary construction errors and keeps bootstrap, manifest and endpoints untouched", () => {
    const arbitrary = `failure containing ${TOKEN}`;
    const transport: RealDebridHttpTransport = new FakeRealDebridTransport([]);
    assert.throws(() => createRealDebridProviderWiring({ enabled: true, token: TOKEN }, {
      createTransport: () => transport,
      createApiClient: () => { throw new Error(arbitrary); },
    }), (error: unknown) => error instanceof RealDebridProviderWiringError && !error.message.includes(TOKEN) && !error.message.includes(arbitrary));
    const bootstrap = readFileSync(new URL("../src/app/bootstrap.ts", import.meta.url), "utf8");
    const manifest = readFileSync(new URL("../src/addon/manifest.ts", import.meta.url), "utf8");
    const router = readFileSync(new URL("../src/server/router.ts", import.meta.url), "utf8");
    assert.doesNotMatch(bootstrap, /RealDebrid|TorrentIndexer/i);
    assert.doesNotMatch(manifest, /RealDebrid|TorrentIndexer/i);
    assert.doesNotMatch(router, /RealDebrid|TorrentIndexer/i);
    assert.match(router, /\/manifest\.json/);
    assert.match(router, /STREAM_PATH_PATTERN/);
  });
});
