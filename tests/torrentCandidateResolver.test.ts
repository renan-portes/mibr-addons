import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataClient } from "../src/types/dataClient.js";
import type { Parser } from "../src/types/parser.js";
import {
  validateResolvedTorrentCandidate,
  type ResolvedTorrentCandidate,
} from "../src/providers/torrentIndexer/torrentCandidateResolver.js";
import { TorrentIndexerParser } from "../src/providers/torrentIndexer/torrentIndexerParser.js";
import { TorrentIndexerProvider } from "../src/providers/torrentIndexer/torrentIndexerProvider.js";
import type {
  TorrentIndexerRawResponse,
  TorrentIndexerRequest,
  TorrentIndexerItem,
  TorrentIndexerResponse,
} from "../src/providers/torrentIndexer/torrentIndexerTypes.js";
import {
  createDeferred,
  FakeTorrentCandidateResolver,
} from "./support/fakeTorrentCandidateResolver.js";

const HASH_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function rawItem(infoHash = HASH_A, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Synthetic discovery title",
    imdb: "tt0000001",
    info_hash: infoHash,
    magnet_link: `magnet:?xt=urn:btih:${infoHash}`,
    files: [{ path: "folder/video.mkv", size: "2 GB" }],
    seed_count: 50,
    ...overrides,
  };
}

class StaticClient implements DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse> {
  callCount = 0;
  constructor(private readonly response: TorrentIndexerRawResponse) {}
  async fetch(): Promise<TorrentIndexerRawResponse> {
    this.callCount += 1;
    return this.response;
  }
}

function provider(
  results: readonly unknown[],
  resolver?: FakeTorrentCandidateResolver,
  options: { enabled?: boolean; candidateLimit?: number; timeoutMs?: number } = {},
): TorrentIndexerProvider {
  return new TorrentIndexerProvider(
    new StaticClient({ results }),
    new TorrentIndexerParser(),
    { indexer: "synthetic" },
    resolver,
    options,
  );
}

function parsedItem(infoHash = HASH_A, overrides: Partial<TorrentIndexerItem> = {}): TorrentIndexerItem {
  return {
    title: "Synthetic discovery title",
    imdb: "tt0000001",
    infoHash,
    audio: [],
    trackers: [],
    files: [{ path: "folder/video.mkv", size: "2 GB" }],
    peers: {},
    ...overrides,
  };
}

function providerWithParsedItems(
  items: readonly TorrentIndexerItem[],
  resolver: FakeTorrentCandidateResolver,
  options: { enabled?: boolean; candidateLimit?: number; timeoutMs?: number } = { enabled: true },
): TorrentIndexerProvider {
  const parser: Parser<TorrentIndexerRawResponse, TorrentIndexerResponse> = {
    parse: () => ({ items: [...items] }),
  };
  return new TorrentIndexerProvider(
    new StaticClient({}),
    parser,
    { indexer: "synthetic" },
    resolver,
    options,
  );
}

function success(overrides: Partial<ResolvedTorrentCandidate> = {}): ResolvedTorrentCandidate {
  return {
    url: "https://media.example.invalid/video.mp4",
    name: "Synthetic video",
    source: "local-test",
    ...overrides,
  };
}

const QUERY = Object.freeze({ type: "movie" as const, id: "tt0000001" });

function instrumentAbortSignal(controller = new AbortController()): {
  readonly controller: AbortController;
  readonly signal: AbortSignal;
  readonly added: () => number;
  readonly removed: () => number;
} {
  const signal = controller.signal;
  const originalAdd = signal.addEventListener.bind(signal) as (...args: unknown[]) => void;
  const originalRemove = signal.removeEventListener.bind(signal) as (...args: unknown[]) => void;
  let added = 0;
  let removed = 0;
  Object.defineProperty(signal, "addEventListener", {
    configurable: true,
    value: (...args: unknown[]) => { added += 1; originalAdd(...args); },
  });
  Object.defineProperty(signal, "removeEventListener", {
    configurable: true,
    value: (...args: unknown[]) => { removed += 1; originalRemove(...args); },
  });
  return { controller, signal, added: () => added, removed: () => removed };
}

describe("resolved torrent candidate validation", () => {
  it("accepts only sanitized public HTTP/HTTPS outputs", () => {
    assert.equal(validateResolvedTorrentCandidate(success())?.url, "https://media.example.invalid/video.mp4");
    assert.equal(validateResolvedTorrentCandidate(success({ url: "http://media.example.invalid/video.mp4" }))?.url, "http://media.example.invalid/video.mp4");
    assert.equal(validateResolvedTorrentCandidate(success({ name: " folder/video.mkv" })), null);
    assert.equal(validateResolvedTorrentCandidate(success({ sizeBytes: -1 })), null);
    assert.equal(validateResolvedTorrentCandidate(success({ expiresAt: "not-a-date" })), null);
  });

  it("applies the explicit query, fragment, port, and IDN policy", () => {
    assert.equal(
      validateResolvedTorrentCandidate(success({ url: "https://media.example.invalid:8443/video?q=1" }))?.url,
      "https://media.example.invalid:8443/video?q=1",
    );
    assert.equal(validateResolvedTorrentCandidate(success({ url: "https://media.example.invalid/video#part" })), null);
    assert.equal(validateResolvedTorrentCandidate(success({ url: "https://mídia.invalid/video" }))?.url, "https://xn--mdia-vpa.invalid/video");
    assert.equal(validateResolvedTorrentCandidate(success({ url: "https://media.example.invalid:99999/video" })), null);
  });

  it("validates size and expiration fields without coercion", () => {
    const now = Date.parse("2030-01-01T00:00:00.000Z");
    assert.equal(validateResolvedTorrentCandidate(success({ sizeBytes: 0 }), now), null);
    for (const sizeBytes of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(validateResolvedTorrentCandidate(success({ sizeBytes }), now), null);
    }
    assert.notEqual(validateResolvedTorrentCandidate(success({
      sizeBytes: 1,
      expiresAt: "2030-01-01T00:00:01.000Z",
    }), now), null);
    assert.equal(validateResolvedTorrentCandidate(success({ expiresAt: "2029-12-31T23:59:59.000Z" }), now), null);
    assert.equal(validateResolvedTorrentCandidate({ ...success(), expiresAt: 123 }, now), null);
  });

  for (const url of [
    `magnet:?xt=urn:btih:${HASH_A}`,
    "file:///tmp/video.mp4",
    "ftp://media.example.invalid/video.mp4",
    "data:text/plain,video",
    "javascript:alert(1)",
  ]) {
    it(`rejects forbidden URL scheme: ${url.split(":")[0]}`, () => {
      assert.equal(validateResolvedTorrentCandidate(success({ url })), null);
    });
  }

  for (const url of [
    "https://user:password@media.example.invalid/video.mp4",
    "http://localhost/video.mp4",
    "http://api.localhost/video.mp4",
    "http://127.0.0.1/video.mp4",
    "http://10.0.0.1/video.mp4",
    "http://172.16.0.1/video.mp4",
    "http://192.168.1.1/video.mp4",
    "http://0.0.0.0/video.mp4",
    "http://100.64.0.1/video.mp4",
    "http://169.254.1.1/video.mp4",
    "http://224.0.0.1/video.mp4",
    "http://[::1]/video.mp4",
    "http://[fd00::1]/video.mp4",
    "http://[fe80::1]/video.mp4",
    "http://[::ffff:127.0.0.1]/video.mp4",
    "http://localhost./video.mp4",
    "http://192.0.2.1/video.mp4",
    "http://198.51.100.1/video.mp4",
    "http://203.0.113.1/video.mp4",
    "http://2130706433/video.mp4",
    "http://0177.0.0.1/video.mp4",
    "http://0x7f000001/video.mp4",
    "http://127.1/video.mp4",
    "\nhttps://media.example.invalid/video.mp4",
  ]) {
    it(`rejects credentials or local/private destination: ${url}`, () => {
      assert.equal(validateResolvedTorrentCandidate(success({ url })), null);
    });
  }

  it("rejects an untrusted redirect chain and accepts a fully validated one", () => {
    assert.equal(validateResolvedTorrentCandidate(success({
      redirectChain: ["https://gateway.example.invalid/start", "http://127.0.0.1/video.mp4"],
    })), null);
    assert.notEqual(validateResolvedTorrentCandidate(success({
      redirectChain: [
        "https://gateway.example.invalid/start",
        "https://media.example.invalid/video.mp4",
      ],
    })), null);
  });
});

describe("TorrentIndexerProvider candidate resolution", () => {
  it("is disabled by default and remains discovery-only without a resolver", async () => {
    const fake = new FakeTorrentCandidateResolver([success()]);
    assert.deepEqual(await provider([rawItem()], fake).getStreams(QUERY, new AbortController().signal), []);
    assert.equal(fake.callCount, 0);
    assert.deepEqual(await provider([rawItem()]).getStreams(QUERY, new AbortController().signal), []);
    const enabledWithoutResolverClient = new StaticClient({ results: [rawItem()] });
    const enabledWithoutResolver = new TorrentIndexerProvider(
      enabledWithoutResolverClient,
      new TorrentIndexerParser(),
      { indexer: "synthetic" },
      undefined,
      { enabled: true },
    );
    assert.deepEqual(await enabledWithoutResolver.getStreams(QUERY, new AbortController().signal), []);
    assert.equal(enabledWithoutResolverClient.callCount, 0);

    const truthyFake = new FakeTorrentCandidateResolver([success()]);
    assert.deepEqual(
      await provider([rawItem()], truthyFake, { enabled: 1 as unknown as boolean })
        .getStreams(QUERY, new AbortController().signal),
      [],
    );
    assert.equal(truthyFake.callCount, 0);
  });

  it("validates candidate and timeout options in the constructor", () => {
    for (const candidateLimit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 11]) {
      assert.throws(() => provider([], undefined, { candidateLimit }), /between 1 and 10/);
    }
    for (const timeoutMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 60_001]) {
      assert.throws(() => provider([], undefined, { timeoutMs }), /between 1 and 60000/);
    }
  });

  it("enforces the default candidate limit of three and configurable maximum of ten", async () => {
    const items = Array.from({ length: 11 }, (_, index) => rawItem(index.toString(16).padStart(40, "0"), { files: [] }));
    const defaultResolver = new FakeTorrentCandidateResolver(Array.from({ length: 11 }, () => null));
    await provider(items, defaultResolver, { enabled: true }).getStreams(QUERY, new AbortController().signal);
    assert.equal(defaultResolver.callCount, 3);

    const maximumResolver = new FakeTorrentCandidateResolver(Array.from({ length: 11 }, () => null));
    await provider(items, maximumResolver, { enabled: true, candidateLimit: 10 })
      .getStreams(QUERY, new AbortController().signal);
    assert.equal(maximumResolver.callCount, 10);
  });

  it("returns no stream for null and maps a validated result without needing the discovery title", async () => {
    const nullResolver = new FakeTorrentCandidateResolver([null]);
    assert.deepEqual(await provider([rawItem()], nullResolver, { enabled: true }).getStreams(QUERY, new AbortController().signal), []);

    const fake = new FakeTorrentCandidateResolver([success()]);
    assert.deepEqual(
      await provider([rawItem()], fake, { enabled: true }).getStreams(QUERY, new AbortController().signal),
      [{ name: "Torrent candidate resolver", title: "Synthetic video", url: "https://media.example.invalid/video.mp4" }],
    );
    assert.equal(fake.callCount, 1);
    assert.deepEqual(Object.keys(fake.requests[0] ?? {}).sort(), ["files", "infoHash", "magnet", "media", "signal"]);
    assert.equal(fake.requests[0]?.infoHash, HASH_A);
    assert.deepEqual(fake.requests[0]?.files, [{ path: "folder/video.mkv", sizeBytes: 2_000_000_000 }]);
    assert.equal(Object.isFrozen(fake.requests[0]), true);
    assert.equal(Object.isFrozen(fake.requests[0]?.files), true);
    assert.equal(Object.isFrozen(fake.requests[0]?.files[0]), true);
    assert.equal(Object.isFrozen(fake.requests[0]?.media), true);
  });

  it("normalizes and validates hashes at the resolver boundary without trusting the parser", async () => {
    const uppercase = HASH_A.toUpperCase();
    const fake = new FakeTorrentCandidateResolver([null]);
    await providerWithParsedItems([
      parsedItem(uppercase),
      parsedItem(HASH_A, { files: [{ path: "other/video.mp4" }] }),
      parsedItem("abc"),
      parsedItem(`${HASH_A}aa`),
      parsedItem(` ${HASH_B}`),
      parsedItem("gggggggggggggggggggggggggggggggggggggggg"),
    ], fake).getStreams(QUERY, new AbortController().signal);
    assert.equal(fake.callCount, 1);
    assert.equal(fake.requests[0]?.infoHash, HASH_A);
    assert.deepEqual(fake.requests[0]?.files, [{ path: "folder/video.mkv", sizeBytes: 2_000_000_000 }]);
  });

  it("never exposes a magnet or an invalid resolver URL", async () => {
    const fake = new FakeTorrentCandidateResolver([success({ url: `magnet:?xt=urn:btih:${HASH_A}` })]);
    const streams = await provider([rawItem()], fake, { enabled: true }).getStreams(QUERY, new AbortController().signal);
    assert.deepEqual(streams, []);
    assert.equal(JSON.stringify(streams).includes("magnet:"), false);
  });

  it("does not call the resolver for invalid hashes, mismatched media, or suspicious paths", async () => {
    const fake = new FakeTorrentCandidateResolver([success()]);
    const invalid = [
      rawItem("not-a-hash"),
      rawItem(HASH_A, { imdb: "tt0000002" }),
      rawItem(HASH_B, { files: [{ path: "../video.mkv" }] }),
      rawItem("cccccccccccccccccccccccccccccccccccccccc", { files: [{ path: "C:\\video.mp4" }] }),
      rawItem("dddddddddddddddddddddddddddddddddddddddd", { files: [{ path: "notes.txt" }] }),
    ];
    assert.deepEqual(await provider(invalid, fake, { enabled: true }).getStreams(QUERY, new AbortController().signal), []);
    assert.equal(fake.callCount, 0);
  });

  it("deduplicates hashes, bounds large arrays, and enforces the configured candidate limit", async () => {
    const duplicateItems = Array.from({ length: 2_000 }, (_, index) => rawItem(
      index < 1_000 ? HASH_A : HASH_B,
      { title: `Synthetic ${index}`, files: [] },
    ));
    const fake = new FakeTorrentCandidateResolver([null, null, success()]);
    assert.deepEqual(
      await provider(duplicateItems, fake, { enabled: true, candidateLimit: 2 }).getStreams(QUERY, new AbortController().signal),
      [],
    );
    assert.equal(fake.callCount, 2);
    assert.deepEqual(fake.requests.map((request) => request.infoHash), [HASH_A, HASH_B]);
  });

  it("accepts exactly 100 files but rejects 101 without forwarding a subset", async () => {
    const files = Array.from({ length: 100 }, (_, index) => ({
      path: `folder/video-${index}.mkv`,
      size: "1 MB",
    }));
    const accepted = new FakeTorrentCandidateResolver([null]);
    await provider([rawItem(HASH_A, { files })], accepted, { enabled: true })
      .getStreams(QUERY, new AbortController().signal);
    assert.equal(accepted.requests[0]?.files.length, 100);

    const rejected = new FakeTorrentCandidateResolver([success()]);
    await provider([rawItem(HASH_A, { files: [...files, { path: "folder/extra.mkv" }] })], rejected, { enabled: true })
      .getStreams(QUERY, new AbortController().signal);
    assert.equal(rejected.callCount, 0);
  });

  it("rejects a very large file array before iterating it and can process the next candidate", async () => {
    const oversized = new Proxy([], {
      get(target, property, receiver) {
        if (property === "length") return 1_000_000;
        if (property === Symbol.iterator || property === "flatMap" || property === "slice") {
          throw new Error("oversized array must not be copied or iterated");
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const fake = new FakeTorrentCandidateResolver([success()]);
    const streams = await providerWithParsedItems([
      parsedItem(HASH_A, { files: oversized }),
      parsedItem(HASH_B, { files: [] }),
    ], fake).getStreams(QUERY, new AbortController().signal);
    assert.equal(streams.length, 1);
    assert.equal(fake.callCount, 1);
    assert.equal(fake.requests[0]?.infoHash, HASH_B);
  });

  it("rejects dangerous paths and accepts a mixed-case video extension", async () => {
    const dangerous = [
      "../video.mkv",
      "%2e%2e/video.mkv",
      "%252e%252e/video.mkv",
      "%2E%2E/video.mkv",
      "folder/video%20name.mkv",
      "folder/%76ideo.mkv",
      "folder/video%2fpart.mkv",
      "folder/video%5cpart.mkv",
      "folder/vid%20eo.mkv",
      "folder/video.%6d%6bv",
      "folder/video%.mkv",
      "folder/video%zz.mkv",
      "\\\\server\\share\\video.mkv",
      "C:\\video.mkv",
      "/video.mkv",
      "video∕file.mkv",
      "folder./video.mkv",
      "folder /video.mkv",
      `${"a".repeat(256)}/video.mkv`,
    ];
    for (const [index, path] of dangerous.entries()) {
      const fake = new FakeTorrentCandidateResolver([success()]);
      await providerWithParsedItems([
        parsedItem(index.toString(16).padStart(40, "a"), { files: [{ path }] }),
      ], fake).getStreams(QUERY, new AbortController().signal);
      assert.equal(fake.callCount, 0, path);
    }

    const accepted = new FakeTorrentCandidateResolver([null]);
    await providerWithParsedItems([
      parsedItem(HASH_A, { files: [{ path: "folder/VIDEO.MkV" }] }),
    ], accepted).getStreams(QUERY, new AbortController().signal);
    assert.equal(accepted.callCount, 1);
  });

  it("deterministically excludes sample and trailer files", async () => {
    const rejected = new FakeTorrentCandidateResolver([success()]);
    await providerWithParsedItems([
      parsedItem(HASH_A, { files: [{ path: "sample.mkv" }, { path: "movie-trailer.mp4" }] }),
    ], rejected).getStreams(QUERY, new AbortController().signal);
    assert.equal(rejected.callCount, 0);

    const accepted = new FakeTorrentCandidateResolver([null]);
    await providerWithParsedItems([
      parsedItem(HASH_A, { files: [{ path: "sample.mkv" }, { path: "feature.mkv" }] }),
    ], accepted).getStreams(QUERY, new AbortController().signal);
    assert.deepEqual(accepted.requests[0]?.files, [{ path: "feature.mkv" }]);
  });

  it("copies and freezes parser-owned input before calling the resolver", async () => {
    const original = parsedItem(HASH_A, {
      title: "Must not be shared",
      trackers: ["udp://tracker.invalid"],
      files: [{ path: "folder/video.mkv" }],
    });
    const fake = new FakeTorrentCandidateResolver([null]);
    await providerWithParsedItems([original], fake).getStreams(QUERY, new AbortController().signal);
    original.files[0]!.path = "mutated.mp4";
    original.trackers.push("udp://mutated.invalid");
    assert.deepEqual(fake.requests[0]?.files, [{ path: "folder/video.mkv" }]);
    assert.equal("title" in (fake.requests[0] ?? {}), false);
    assert.equal("trackers" in (fake.requests[0] ?? {}), false);
  });

  it("does not treat seeders as a safety signal", async () => {
    const fake = new FakeTorrentCandidateResolver([success()]);
    const streams = await provider([rawItem(HASH_A, { seed_count: 0, files: [] })], fake, { enabled: true })
      .getStreams(QUERY, new AbortController().signal);
    assert.equal(streams.length, 1);
    assert.equal(fake.callCount, 1);
  });

  it("isolates one resolver error and can resolve the next candidate without logging sensitive data", async () => {
    const fake = new FakeTorrentCandidateResolver([new Error(`secret ${HASH_A} magnet:?`), success()]);
    const originalError = console.error;
    const logs: unknown[] = [];
    console.error = (...values: unknown[]) => { logs.push(values); };
    try {
      const streams = await provider(
        [rawItem(HASH_A, { files: [] }), rawItem(HASH_B, { files: [] })],
        fake,
        { enabled: true },
      ).getStreams(QUERY, new AbortController().signal);
      assert.equal(streams.length, 1);
      assert.equal(fake.callCount, 2);
      assert.deepEqual(logs, []);
    } finally {
      console.error = originalError;
    }
  });

  it("continues after null and stops at the first valid success", async () => {
    const fake = new FakeTorrentCandidateResolver([null, success(), new Error("must not run")]);
    const streams = await provider([
      rawItem(HASH_A, { files: [] }),
      rawItem(HASH_B, { files: [] }),
      rawItem("cccccccccccccccccccccccccccccccccccccccc", { files: [] }),
    ], fake, { enabled: true }).getStreams(QUERY, new AbortController().signal);
    assert.equal(streams.length, 1);
    assert.equal(fake.callCount, 2);
  });

  it("removes the parent listener and clears the timeout after success", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const observed = instrumentAbortSignal();

    const fake = new FakeTorrentCandidateResolver([success()]);
    assert.equal((await provider([rawItem()], fake, { enabled: true }).getStreams(QUERY, observed.signal)).length, 1);
    assert.equal(observed.added(), 1);
    assert.equal(observed.removed(), 1);
    context.mock.timers.tick(5_000);
    assert.equal(fake.requests[0]?.signal.aborted, false);
  });

  it("revalidates cancellation when resolution and cancellation share the microtask queue", async () => {
    const deferred = createDeferred<ResolvedTorrentCandidate | null>();
    const fake = new FakeTorrentCandidateResolver([deferred.promise, success()]);
    const controller = new AbortController();
    const pending = provider([
      rawItem(HASH_A, { files: [] }),
      rawItem(HASH_B, { files: [] }),
    ], fake, { enabled: true }).getStreams(QUERY, controller.signal);
    await fake.waitForCall();
    deferred.resolve(success());
    queueMicrotask(() => controller.abort(new DOMException("cancelled", "AbortError")));
    await assert.rejects(() => pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
    assert.equal(fake.callCount, 1);
  });

  it("revalidates cancellation after the resolver wins and before StreamResult creation", async () => {
    const controller = new AbortController();
    const result = {
      get url() {
        controller.abort(new DOMException("cancelled before emission", "AbortError"));
        return "https://media.example.invalid/video.mp4";
      },
      source: "local-test" as const,
    };
    const fake = new FakeTorrentCandidateResolver([result, success()]);
    const pending = provider([
      rawItem(HASH_A, { files: [] }),
      rawItem(HASH_B, { files: [] }),
    ], fake, { enabled: true }).getStreams(QUERY, controller.signal);
    await assert.rejects(() => pending, /cancelled before emission/);
    assert.equal(fake.callCount, 1);
  });

  it("gives timeout priority when timeout and resolution occur in the same timer tick", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const deferred = createDeferred<ResolvedTorrentCandidate | null>();
    const fake = new FakeTorrentCandidateResolver([deferred.promise]);
    const pending = provider([rawItem()], fake, { enabled: true, timeoutMs: 5_000 })
      .getStreams(QUERY, new AbortController().signal);
    await fake.waitForCall();
    setTimeout(() => deferred.resolve(success()), 5_000);
    context.mock.timers.tick(5_000);
    assert.deepEqual(await pending, []);
    assert.equal(fake.callCount, 1);
  });

  it("times out a non-cooperative resolver and continues sequentially", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const never = createDeferred<ResolvedTorrentCandidate | null>();
    const fake = new FakeTorrentCandidateResolver([never.promise, success()]);
    const pending = provider(
      [rawItem(HASH_A, { files: [] }), rawItem(HASH_B, { files: [] })],
      fake,
      { enabled: true, timeoutMs: 5_000 },
    ).getStreams(QUERY, new AbortController().signal);
    await fake.waitForCall();
    context.mock.timers.tick(5_000);
    assert.equal((await pending).length, 1);
    assert.equal(fake.callCount, 2);
    assert.equal(fake.requests[0]?.signal.aborted, true);
  });

  it("cleans the parent listener and timeout after timeout", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const observed = instrumentAbortSignal();
    const never = createDeferred<ResolvedTorrentCandidate | null>();
    const fake = new FakeTorrentCandidateResolver([never.promise]);
    const pending = provider([rawItem()], fake, { enabled: true, timeoutMs: 5_000 })
      .getStreams(QUERY, observed.signal);
    await fake.waitForCall();
    context.mock.timers.tick(5_000);
    assert.deepEqual(await pending, []);
    assert.equal(observed.added(), 1);
    assert.equal(observed.removed(), 1);
    const reason = fake.requests[0]?.signal.reason;
    context.mock.timers.tick(5_000);
    assert.equal(fake.requests[0]?.signal.reason, reason);
  });

  it("cleans the parent listener and timeout after resolver error", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const observed = instrumentAbortSignal();
    const fake = new FakeTorrentCandidateResolver([new Error("synthetic")]);
    assert.deepEqual(
      await provider([rawItem()], fake, { enabled: true }).getStreams(QUERY, observed.signal),
      [],
    );
    assert.equal(observed.added(), 1);
    assert.equal(observed.removed(), 1);
    context.mock.timers.tick(5_000);
    assert.equal(fake.requests[0]?.signal.aborted, false);
  });

  it("accepts a response before the timeout and ignores a response after it", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const before = createDeferred<ResolvedTorrentCandidate | null>();
    const beforeFake = new FakeTorrentCandidateResolver([before.promise]);
    const beforePending = provider([rawItem()], beforeFake, { enabled: true, timeoutMs: 5_000 })
      .getStreams(QUERY, new AbortController().signal);
    await beforeFake.waitForCall();
    context.mock.timers.tick(4_999);
    before.resolve(success());
    assert.equal((await beforePending).length, 1);

    const after = createDeferred<ResolvedTorrentCandidate | null>();
    const afterFake = new FakeTorrentCandidateResolver([after.promise]);
    const afterPending = provider([rawItem()], afterFake, { enabled: true, timeoutMs: 5_000 })
      .getStreams(QUERY, new AbortController().signal);
    await afterFake.waitForCall();
    context.mock.timers.tick(5_000);
    assert.deepEqual(await afterPending, []);
    after.resolve(success());
    await Promise.resolve();
    assert.equal(afterFake.callCount, 1);
  });

  it("handles a late rejection without unhandledRejection", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const late = createDeferred<ResolvedTorrentCandidate | null>();
    const fake = new FakeTorrentCandidateResolver([late.promise]);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const pending = provider([rawItem()], fake, { enabled: true, timeoutMs: 5_000 })
        .getStreams(QUERY, new AbortController().signal);
      await fake.waitForCall();
      context.mock.timers.tick(5_000);
      assert.deepEqual(await pending, []);
      late.reject(new Error("late synthetic failure"));
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(unhandled, []);
    } finally {
      process.removeListener("unhandledRejection", onUnhandled);
    }
  });

  it("rejects an already-aborted parent before fetch or resolver", async () => {
    const client = new StaticClient({ results: [rawItem()] });
    const fake = new FakeTorrentCandidateResolver([success()]);
    const instance = new TorrentIndexerProvider(
      client,
      new TorrentIndexerParser(),
      { indexer: "synthetic" },
      fake,
      { enabled: true },
    );
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    await assert.rejects(() => instance.getStreams(QUERY, controller.signal), /cancelled/);
    assert.equal(client.callCount, 0);
    assert.equal(fake.callCount, 0);
  });

  it("propagates parent cancellation to the resolver", async () => {
    const fake = new FakeTorrentCandidateResolver(["wait-for-abort"]);
    const controller = new AbortController();
    const pending = provider([
      rawItem(HASH_A, { files: [] }),
      rawItem(HASH_B, { files: [] }),
    ], fake, { enabled: true }).getStreams(QUERY, controller.signal);
    await fake.waitForCall();
    controller.abort(new DOMException("cancelled", "AbortError"));
    await assert.rejects(() => pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
    assert.equal(fake.requests[0]?.signal.aborted, true);
    assert.equal(fake.callCount, 1);
  });

  it("cleans the parent listener and timeout after cancellation", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const observed = instrumentAbortSignal();
    const fake = new FakeTorrentCandidateResolver(["wait-for-abort"]);
    const pending = provider([rawItem()], fake, { enabled: true }).getStreams(QUERY, observed.signal);
    await fake.waitForCall();
    observed.controller.abort(new DOMException("cancelled", "AbortError"));
    await assert.rejects(() => pending, /cancelled/);
    assert.equal(observed.added(), 1);
    assert.equal(observed.removed(), 1);
    const reason = fake.requests[0]?.signal.reason;
    context.mock.timers.tick(5_000);
    assert.equal(fake.requests[0]?.signal.reason, reason);
  });

  it("copies a mutable resolver result before returning StreamResult", async () => {
    const mutable = success({ name: "Original name" }) as {
      url: string;
      name?: string;
      source: "local-test";
    };
    const fake = new FakeTorrentCandidateResolver([mutable]);
    const streams = await provider([rawItem()], fake, { enabled: true })
      .getStreams(QUERY, new AbortController().signal);
    mutable.url = "https://changed.example.invalid/changed.mp4";
    mutable.name = "Changed name";
    assert.deepEqual(streams, [{
      name: "Torrent candidate resolver",
      title: "Original name",
      url: "https://media.example.invalid/video.mp4",
    }]);
    assert.equal(JSON.stringify(streams).includes(HASH_A), false);
    assert.equal(JSON.stringify(streams).includes("magnet:"), false);
    assert.equal(JSON.stringify(streams).includes("tracker"), false);
  });
});
