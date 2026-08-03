import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { DataClient } from "../src/types/dataClient.js";
import type { Parser } from "../src/types/parser.js";
import {
  createExperimentalRealDebridAddonRuntime,
  ExperimentalRealDebridAddonRuntimeError,
} from "../src/runtime/experimentalRealDebridAddonRuntime.js";
import type { TorrentIndexerRawResponse, TorrentIndexerRequest, TorrentIndexerResponse } from "../src/providers/torrentIndexer/torrentIndexerTypes.js";
import { FakeTorrentCandidateResolver } from "./support/fakeTorrentCandidateResolver.js";
import { FakeRealDebridTransport } from "./support/fakeRealDebridTransport.js";
import { RealDebridApiClient } from "../src/providers/torrentIndexer/realDebridApiClient.js";

const TOKEN = "synthetic-addon-runtime-token-not-real";
const HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const QUERY = Object.freeze({ type: "movie" as const, id: "tt0000001" });

class StaticClient implements DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse> {
  calls = 0;
  async fetch(): Promise<TorrentIndexerRawResponse> {
    this.calls += 1;
    return { results: [{ title: "Synthetic", imdb: "tt0000001", info_hash: HASH, files: [{ path: "video.mkv", size: "1 GB" }] }] };
  }
}

const parser: Parser<TorrentIndexerRawResponse, TorrentIndexerResponse> = {
  parse: () => ({ items: [{ title: "Synthetic", imdb: "tt0000001", infoHash: HASH, audio: [], trackers: [], files: [{ path: "video.mkv", size: "1 GB" }], peers: {} }] }),
};

function config(enabled: boolean, token?: string) {
  return { enabled, ...(token === undefined ? {} : { token }), source: { indexer: "synthetic" } };
}

describe("experimental Real-Debrid addon runtime", () => {
  it("keeps disabled composition discovery-only without constructing the wiring", async () => {
    const counts = { transport: 0, api: 0, resolver: 0 };
    const runtime = createExperimentalRealDebridAddonRuntime(config(false), {
      client: new StaticClient(), parser,
      wiring: {
        createTransport: () => { counts.transport += 1; return new FakeRealDebridTransport([]); },
        createApiClient: (transport, token) => { counts.api += 1; return new RealDebridApiClient(transport, token); },
        createResolver: () => { counts.resolver += 1; return new FakeTorrentCandidateResolver([]); },
      },
    });
    assert.equal(runtime.providerManager.list().length, 1);
    assert.deepEqual(await runtime.providerManager.getStreamsFromAll(QUERY), []);
    assert.deepEqual(counts, { transport: 0, api: 0, resolver: 0 });
  });

  it("fails closed before construction when enabled lacks a usable token", () => {
    for (const value of [undefined, "", "   "]) {
      let transports = 0;
      assert.throws(() => createExperimentalRealDebridAddonRuntime(config(true, value), {
        client: new StaticClient(), parser,
        wiring: { createTransport: () => { transports += 1; return new FakeRealDebridTransport([]); } },
      }), ExperimentalRealDebridAddonRuntimeError);
      assert.equal(transports, 0);
    }
  });

  it("registers only an isolated provider and maps a fake resolved candidate", async () => {
    const counts = { transport: 0, api: 0, resolver: 0 };
    const resolver = new FakeTorrentCandidateResolver([{ url: "https://media.example.invalid/stream.mp4", name: "Synthetic", sizeBytes: 1, source: "local-test" }]);
    const runtime = createExperimentalRealDebridAddonRuntime(config(true, TOKEN), {
      client: new StaticClient(), parser,
      wiring: {
        createTransport: () => { counts.transport += 1; return new FakeRealDebridTransport([]); },
        createApiClient: (transport, token) => { counts.api += 1; return new RealDebridApiClient(transport, token); },
        createResolver: () => { counts.resolver += 1; return resolver; },
      },
    });
    const streams = await runtime.providerManager.getStreamsFromAll(QUERY);
    assert.equal(runtime.providerManager.get("torrent-indexer"), runtime.provider);
    assert.equal(streams.length, 1);
    assert.equal(streams[0]?.url, "https://media.example.invalid/stream.mp4");
    assert.deepEqual(counts, { transport: 1, api: 1, resolver: 1 });
    assert.equal(JSON.stringify(runtime).includes(TOKEN), false);
    assert.equal(Object.keys(runtime).some((key) => /token/i.test(key)), false);
    assert.equal(JSON.stringify({ ...runtime }).includes(TOKEN), false);
  });

  it("propagates cancellation and leaves the standard bootstrap, manifest and router isolated", async () => {
    const resolver = new FakeTorrentCandidateResolver(["wait-for-abort"]);
    const runtime = createExperimentalRealDebridAddonRuntime(config(true, TOKEN), {
      client: new StaticClient(), parser,
      wiring: {
        createTransport: () => new FakeRealDebridTransport([]),
        createApiClient: (transport, token) => new RealDebridApiClient(transport, token),
        createResolver: () => resolver,
      },
    });
    const controller = new AbortController();
    const pending = runtime.provider.getStreams(QUERY, controller.signal);
    await resolver.waitForCall();
    controller.abort(new DOMException("cancelled", "AbortError"));
    await assert.rejects(() => pending, /cancelled/);
    assert.equal(resolver.requests[0]?.signal.aborted, true);
    for (const file of ["../src/app/bootstrap.ts", "../src/addon/manifest.ts", "../src/server/router.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      assert.doesNotMatch(source, /ExperimentalRealDebridAddonRuntime|TorrentIndexerProvider|RealDebridCandidateResolver/);
    }
  });

  it("isolates resolver errors without exposing synthetic token material", async () => {
    const resolver = new FakeTorrentCandidateResolver([new Error(`arbitrary ${TOKEN} payload`)]);
    const runtime = createExperimentalRealDebridAddonRuntime(config(true, TOKEN), {
      client: new StaticClient(), parser,
      wiring: {
        createTransport: () => new FakeRealDebridTransport([]),
        createApiClient: (transport, token) => new RealDebridApiClient(transport, token),
        createResolver: () => resolver,
      },
    });
    const originalError = console.error;
    const logs: unknown[] = [];
    console.error = (...args: unknown[]) => logs.push(args);
    try {
      assert.deepEqual(await runtime.providerManager.getStreamsFromAll(QUERY), []);
      assert.equal(JSON.stringify(logs).includes(TOKEN), false);
    } finally {
      console.error = originalError;
    }
  });
});
