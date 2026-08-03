import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_FILE_BYTES, RealDebridApiClient, RealDebridResolverError, type RealDebridTransportResponse } from "../src/providers/torrentIndexer/realDebridApiClient.js";
import { RealDebridCandidateResolver, selectRealDebridFile } from "../src/providers/torrentIndexer/realDebridCandidateResolver.js";
import type { TorrentCandidateResolutionRequest } from "../src/providers/torrentIndexer/torrentCandidateResolver.js";
import { FakeRealDebridTransport, json, noContent, type FakeRealDebridOutcome } from "./support/fakeRealDebridTransport.js";

const TOKEN = "test-token-not-a-real-secret";
const HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MAGNET = `magnet:?xt=urn:btih:${HASH}`;
const FILE = Object.freeze({ id: 7, path: "/folder/movie.mkv", bytes: 2_000, selected: 0 });
type Options = ConstructorParameters<typeof RealDebridCandidateResolver>[1];

interface Deferred<T> { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void; }
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function info(status: string, files: unknown = [FILE], links: unknown = []): unknown { return { id: "torrent-1", status, files, links, ignored: true }; }
function selected(files: unknown = [{ ...FILE, selected: 1 }], links: unknown = ["https://link.example.invalid/x"]): unknown {
  return info("downloaded", files, links);
}
function request(overrides: Partial<TorrentCandidateResolutionRequest> = {}): TorrentCandidateResolutionRequest {
  return Object.freeze({ infoHash: HASH, magnet: MAGNET, files: Object.freeze([]), media: Object.freeze({ id: "tt0000001", type: "movie" as const }), signal: new AbortController().signal, ...overrides });
}
function setup(outcomes: readonly FakeRealDebridOutcome[], options: Options = {}) {
  const transport = new FakeRealDebridTransport(outcomes);
  const api = new RealDebridApiClient(transport, TOKEN);
  return { transport, api, resolver: new RealDebridCandidateResolver(api, options) };
}
function successQueue(cleanup: FakeRealDebridOutcome = noContent): FakeRealDebridOutcome[] {
  return [json({ id: "torrent-1" }), json(info("waiting_files_selection")), noContent, json(selected()), json({ download: "https://media.example.invalid/movie.mkv" }), cleanup];
}

describe("RealDebridCandidateResolver offline adapter", () => {
  it("requires a fresh post-select snapshot and performs each non-idempotent endpoint once", async () => {
    const current = setup(successQueue());
    assert.deepEqual(await current.resolver.resolve(request()), { url: "https://media.example.invalid/movie.mkv", name: "movie.mkv", sizeBytes: 2_000, source: "authorized-resolver" });
    assert.deepEqual(current.transport.calls.map((call) => `${call.method} ${call.pathname}`), [
      "POST /torrents/addMagnet", "GET /torrents/info/torrent-1", "POST /torrents/selectFiles/torrent-1",
      "GET /torrents/info/torrent-1", "POST /unrestrict/link", "DELETE /torrents/delete/torrent-1",
    ]);
    assert.deepEqual(current.transport.calls.filter((call) => call.method === "POST").map((call) => call.bodyKeys), [["magnet"], ["files"], ["link"]]);
    assert.equal(JSON.stringify(current.transport.calls).includes(TOKEN), false);
    current.transport.assertExhausted();
  });

  it("does not reuse links from a downloaded pre-select snapshot", async () => {
    const current = setup([json({ id: "torrent-1" }), json(selected()), noContent, json(selected()), json({ download: "https://media.example.invalid/movie.mkv" }), noContent]);
    assert.notEqual(await current.resolver.resolve(request()), null);
    assert.equal(current.transport.calls.filter((call) => call.method === "GET").length, 2);
    current.transport.assertExhausted();
  });

  it("associates only one selected ID with exactly one final link, regardless of file order", async () => {
    const other = { id: 8, path: "/folder/other.mkv", bytes: 1_000, selected: 0 };
    const current = setup([json({ id: "torrent-1" }), json(info("waiting_files_selection", [FILE, other])), noContent,
      json(selected([other, { ...FILE, selected: 1 }])), json({ download: "https://media.example.invalid/movie.mkv" }), noContent]);
    assert.notEqual(await current.resolver.resolve(request()), null);
    current.transport.assertExhausted();
  });

  it("matches an authorized file by exact path and size without basename fallback", async () => {
    const authorized = (path: string, sizeBytes = 2_000) => request({ files: Object.freeze([Object.freeze({ path, sizeBytes })]) });
    const cases: Array<[readonly unknown[], TorrentCandidateResolutionRequest, string]> = [
      [[FILE], authorized("folder/movie.mkv"), "success"],
      [[FILE], authorized("movie.mkv"), "authorized_file_not_found"],
      [[{ ...FILE, path: "/root/folder/movie.mkv" }], authorized("folder/movie.mkv"), "authorized_file_not_found"],
      [[{ ...FILE, path: "folder/movie.mkv" }], authorized("folder/movie.mkv"), "file_list_invalid"],
      [[{ ...FILE, path: "//folder/movie.mkv" }], authorized("folder/movie.mkv"), "file_list_invalid"],
      [[FILE], authorized("folder/movie.mkv", 1_999), "authorized_file_size_mismatch"],
      [[FILE, { ...FILE, id: 8 }], authorized("folder/movie.mkv"), "ambiguous_authorized_file"],
      [[{ ...FILE, id: 0 }], authorized("folder/movie.mkv"), "file_id_invalid"],
      [[{ ...FILE, path: "/one/movie.mkv" }, { ...FILE, id: 8, path: "/two/movie.mkv" }], authorized("movie.mkv"), "authorized_file_not_found"],
    ];
    for (const [files, candidate, expected] of cases) {
      const outcomes = expected === "success" ? successQueue() : [json({ id: "torrent-1" }), json(info("waiting_files_selection", files)), noContent];
      const current = setup(outcomes);
      if (expected === "success") assert.notEqual(await current.resolver.resolve(candidate), null);
      else await assert.rejects(() => current.resolver.resolve(candidate), (error: unknown) => error instanceof RealDebridResolverError && error.code === expected);
      assert.equal(current.transport.calls.filter((call) => call.pathname.includes("selectFiles")).length, expected === "success" ? 1 : 0);
      current.transport.assertExhausted();
    }
  });

  it("normalizes exactly one contractual API slash before exact authorization", async () => {
    for (const [apiPath, internalPath] of [["/video.mp4", "video.mp4"], ["/directory/video.mp4", "directory/video.mp4"]] as const) {
      const transport = new FakeRealDebridTransport([json(info("waiting_files_selection", [{ ...FILE, path: apiPath }]))]);
      const decoded = await new RealDebridApiClient(transport, TOKEN).info("torrent-1", new AbortController().signal);
      assert.equal(decoded.files[0]?.path, internalPath);
      transport.assertExhausted();
    }
  });

  it("sends only the exactly authorized synthetic file ID to selectFiles", async () => {
    const current = setup(successQueue());
    let selectedId: number | undefined;
    const original = current.api.selectFile.bind(current.api);
    current.api.selectFile = async (torrentId, fileId, signal) => { selectedId = fileId; await original(torrentId, fileId, signal); };
    assert.notEqual(await current.resolver.resolve(request({ files: Object.freeze([Object.freeze({ path: "folder/movie.mkv", sizeBytes: 2_000 })]) })), null);
    assert.equal(selectedId, 7);
    current.transport.assertExhausted();
  });

  it("rejects every ambiguous final file/link cardinality", async () => {
    const cases: Array<[unknown, string]> = [
      [selected([{ ...FILE, selected: 0 }]), "ambiguous_file_selection"],
      [selected([{ ...FILE, id: 9, selected: 1 }]), "file_not_found"],
      [selected([{ ...FILE, selected: 1 }, { id: 8, path: "/other.mkv", bytes: 1, selected: 1 }]), "ambiguous_file_selection"],
      [selected([{ ...FILE, selected: 1 }], []), "link_not_found"],
      [selected([{ ...FILE, selected: 1 }], ["https://one.invalid", "https://two.invalid"]), "ambiguous_link"],
      [selected([{ ...FILE, selected: 1 }], ["https://same.invalid", "https://same.invalid"]), "ambiguous_link"],
    ];
    for (const [snapshot, code] of cases) {
      const current = setup([json({ id: "torrent-1" }), json(info("waiting_files_selection")), noContent, json(snapshot), noContent]);
      await assert.rejects(() => current.resolver.resolve(request()), (error: unknown) => error instanceof RealDebridResolverError && error.code === code);
      assert.equal(current.transport.calls.some((call) => call.pathname === "/unrestrict/link"), false);
      current.transport.assertExhausted();
    }
  });

  it("polls only GET info with an injected delay and stops at the configured limit", async () => {
    let delays = 0;
    const current = setup([json({ id: "torrent-1" }), json(info("magnet_conversion", [], [])), json(info("waiting_files_selection")), noContent,
      json(info("downloading", [{ ...FILE, selected: 1 }])), json(selected()), json({ download: "https://media.example.invalid/x" }), noContent],
    { pollAttempts: 3, delay: async () => { delays += 1; } });
    assert.notEqual(await current.resolver.resolve(request()), null);
    assert.equal(delays, 2);
    assert.equal(current.transport.calls.filter((call) => call.method === "POST").length, 3);
    current.transport.assertExhausted();

    const limited = setup([json({ id: "torrent-1" }), json(info("queued", [], [])), json(info("queued", [], [])), noContent], { pollAttempts: 2, delay: async () => {} });
    await assert.rejects(() => limited.resolver.resolve(request()), (error: unknown) => error instanceof RealDebridResolverError && error.code === "polling_exhausted");
    limited.transport.assertExhausted();
  });

  it("accepts every documented transient post-select state and succeeds on the last attempt", async () => {
    for (const status of ["queued", "downloading", "compressing", "uploading"] as const) {
      const current = setup([json({ id: "torrent-1" }), json(info("waiting_files_selection")), noContent,
        json(info(status, [{ ...FILE, selected: 1 }])), json(selected()),
        json({ download: "https://media.example.invalid/x" }), noContent], { pollAttempts: 2, delay: async () => {} });
      assert.notEqual(await current.resolver.resolve(request()), null);
      assert.equal(current.transport.calls.filter((call) => call.pathname === "/torrents/info/torrent-1").length, 3);
      assert.equal(current.transport.calls.filter((call) => call.pathname === "/torrents/selectFiles/torrent-1").length, 1);
      assert.equal(current.transport.calls.filter((call) => call.pathname === "/unrestrict/link").length, 1);
      current.transport.assertExhausted();
    }
  });

  it("distinguishes info and delay timeouts and never unrestricts after either failure", async () => {
    const infoTimeout = setup([json({ id: "torrent-1" }), json(info("waiting_files_selection")), noContent, noContent]);
    const originalInfo = infoTimeout.api.info.bind(infoTimeout.api); let infoCalls = 0;
    infoTimeout.api.info = async (...args) => { infoCalls += 1; if (infoCalls === 2) throw new RealDebridResolverError("timeout"); return await originalInfo(...args); };
    await assert.rejects(() => infoTimeout.resolver.resolve(request()), (error: unknown) => error instanceof RealDebridResolverError && error.code === "info_request_timeout");
    assert.equal(infoTimeout.transport.calls.some((call) => call.pathname === "/unrestrict/link"), false);
    infoTimeout.transport.assertExhausted();

    const delayTimeout = setup([json({ id: "torrent-1" }), json(info("waiting_files_selection")), noContent,
      json(info("downloading", [{ ...FILE, selected: 1 }])), noContent],
    { delay: async () => { throw new RealDebridResolverError("timeout"); } });
    await assert.rejects(() => delayTimeout.resolver.resolve(request()), (error: unknown) => error instanceof RealDebridResolverError && error.code === "polling_delay_timeout");
    assert.equal(delayTimeout.transport.calls.some((call) => call.pathname === "/unrestrict/link"), false);
    delayTimeout.transport.assertExhausted();
  });

  it("stops immediately on a terminal post-select state and still cleans up", async () => {
    const current = setup([json({ id: "torrent-1" }), json(info("waiting_files_selection")), noContent,
      json(info("dead", [{ ...FILE, selected: 1 }])), noContent]);
    await assert.rejects(() => current.resolver.resolve(request()), (error: unknown) => error instanceof RealDebridResolverError && error.code === "terminal_status");
    assert.equal(current.transport.calls.filter((call) => call.method === "POST").length, 2);
    assert.equal(current.transport.calls.some((call) => call.pathname === "/unrestrict/link"), false);
    current.transport.assertExhausted();
  });

  it("limits a non-cooperative delay and cancellation during delay without later HTTP", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const never = deferred<void>(); const delayStarted = deferred<void>();
    const timed = setup([json({ id: "torrent-1" }), json(info("queued", [], [])), noContent], { totalTimeoutMs: 20, delay: () => { delayStarted.resolve(); return never.promise; } });
    const pending = timed.resolver.resolve(request()); await delayStarted.promise;
    context.mock.timers.tick(20);
    await assert.rejects(() => pending, (error: unknown) => error instanceof RealDebridResolverError && error.code === "global_timeout");
    timed.transport.assertExhausted();
    never.reject(new Error("late secret")); await new Promise<void>((resolve) => setImmediate(resolve));

    const controller = new AbortController(); const blocked = deferred<void>(); const cancelledDelayStarted = deferred<void>();
    const cancelled = setup([json({ id: "torrent-1" }), json(info("queued", [], []))], { delay: () => { cancelledDelayStarted.resolve(); return blocked.promise; } });
    const cancelledPending = cancelled.resolver.resolve(request({ signal: controller.signal })); await cancelledDelayStarted.promise;
    controller.abort();
    await assert.rejects(() => cancelledPending, (error: unknown) => error instanceof RealDebridResolverError && error.code === "canceled");
    cancelled.transport.assertExhausted(); blocked.resolve();
  });

  it("gives timeout and cancellation priority over same-tick transport completion", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const response = deferred<RealDebridTransportResponse>();
    const timed = setup([response.promise], { totalTimeoutMs: 20, cleanup: false });
    const pending = timed.resolver.resolve(request()); await Promise.resolve();
    setTimeout(() => response.resolve(json({ id: "torrent-1" })), 20);
    context.mock.timers.tick(20);
    await assert.rejects(() => pending, (error: unknown) => error instanceof RealDebridResolverError && error.code === "global_timeout");
    timed.transport.assertExhausted();

    const controller = new AbortController(); const same = deferred<RealDebridTransportResponse>();
    const cancelled = setup([same.promise], { cleanup: false });
    const cancelledPending = cancelled.resolver.resolve(request({ signal: controller.signal })); await Promise.resolve();
    same.resolve(json({ id: "torrent-1" })); queueMicrotask(() => controller.abort());
    await assert.rejects(() => cancelledPending, (error: unknown) => error instanceof RealDebridResolverError && error.code === "canceled");
    cancelled.transport.assertExhausted();
  });

  it("consumes late transport resolution and rejection without unhandledRejection", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    for (const rejectLate of [false, true]) {
      const late = deferred<RealDebridTransportResponse>(); const current = setup([late.promise], { totalTimeoutMs: 20, cleanup: false });
      const unhandled: unknown[] = []; const listener = (reason: unknown) => unhandled.push(reason); process.on("unhandledRejection", listener);
      try {
        const pending = current.resolver.resolve(request()); await Promise.resolve(); context.mock.timers.tick(20);
        await assert.rejects(() => pending);
        if (rejectLate) late.reject(new Error("late")); else late.resolve(json({ id: "torrent-1" }));
        await new Promise<void>((resolve) => setImmediate(resolve)); assert.deepEqual(unhandled, []);
      } finally { process.removeListener("unhandledRejection", listener); }
      current.transport.assertExhausted();
    }
  });

  it("revalidates cancellation at each workflow boundary", async () => {
    const boundaries = ["before-select", "post-select", "before-unrestrict"] as const;
    for (const boundary of boundaries) {
      const controller = new AbortController();
      const outcomes = boundary === "before-select"
        ? [json({ id: "torrent-1" }), json(info("waiting_files_selection"))]
        : boundary === "post-select"
          ? [json({ id: "torrent-1" }), json(info("waiting_files_selection")), noContent]
          : [json({ id: "torrent-1" }), json(info("waiting_files_selection")), noContent, json(selected())];
      const current = setup(outcomes, { cleanup: false });
      if (boundary === "before-select") {
        const original = current.api.selectFile.bind(current.api); current.api.selectFile = async (...args) => { controller.abort(); return original(...args); };
      } else if (boundary === "post-select") {
        let calls = 0; const original = current.api.info.bind(current.api); current.api.info = async (...args) => { calls += 1; if (calls === 2) controller.abort(); return original(...args); };
      } else {
        const original = current.api.unrestrict.bind(current.api); current.api.unrestrict = async (...args) => { controller.abort(); return original(...args); };
      }
      await assert.rejects(() => current.resolver.resolve(request({ signal: controller.signal })), (error: unknown) => error instanceof RealDebridResolverError && error.code === "canceled");
      assert.equal(current.transport.calls.some((call) => call.pathname === "/torrents/delete/torrent-1"), false);
      current.transport.assertExhausted();
    }

    const controller = new AbortController(); const blocked = deferred<RealDebridTransportResponse>();
    const during = setup([json({ id: "torrent-1" }), json(info("waiting_files_selection")), noContent, json(selected()), blocked.promise], { cleanup: false });
    const pending = during.resolver.resolve(request({ signal: controller.signal }));
    while (!during.transport.calls.some((call) => call.pathname === "/unrestrict/link")) await Promise.resolve();
    controller.abort();
    await assert.rejects(() => pending, (error: unknown) => error instanceof RealDebridResolverError && error.code === "canceled");
    blocked.resolve(json({ download: "https://media.example.invalid/late" }));
    during.transport.assertExhausted();
  });

  it("uses an independent bounded cleanup and global cancellation wins during DELETE", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const neverDelete = deferred<RealDebridTransportResponse>();
    const current = setup(successQueue(neverDelete.promise), { cleanupTimeoutMs: 20 });
    const pending = current.resolver.resolve(request());
    while (!current.transport.calls.some((call) => call.method === "DELETE")) await Promise.resolve();
    context.mock.timers.tick(20);
    assert.notEqual(await pending, null); assert.equal(current.resolver.lastCleanupErrorCode, "cleanup_failed"); current.transport.assertExhausted();
    neverDelete.reject(new Error("late cleanup"));

    const controller = new AbortController(); const deleteBarrier = deferred<RealDebridTransportResponse>();
    const cancelled = setup(successQueue(deleteBarrier.promise), { cleanupTimeoutMs: 100 });
    const cancelledPending = cancelled.resolver.resolve(request({ signal: controller.signal }));
    while (!cancelled.transport.calls.some((call) => call.method === "DELETE")) await Promise.resolve();
    controller.abort(); deleteBarrier.reject(new Error("cleanup failed after cancel"));
    await assert.rejects(() => cancelledPending, (error: unknown) => error instanceof RealDebridResolverError && error.code === "canceled");
    cancelled.transport.assertExhausted();
  });

  it("keeps cleanup best-effort, observable and never repeated", async () => {
    const success = setup(successQueue(new Error(`${TOKEN} ${MAGNET}`)));
    assert.notEqual(await success.resolver.resolve(request()), null); assert.equal(success.resolver.lastCleanupErrorCode, "cleanup_failed");
    assert.equal(success.transport.calls.filter((call) => call.method === "DELETE").length, 1); success.transport.assertExhausted();

    const primary = setup([json({ id: "torrent-1" }), json(info("dead")), new Error("cleanup")]);
    await assert.rejects(() => primary.resolver.resolve(request()), (error: unknown) => error instanceof RealDebridResolverError && error.code === "terminal_status");
    assert.equal(primary.resolver.lastCleanupErrorCode, "cleanup_failed"); primary.transport.assertExhausted();
  });

  it("decodes statuses, HTTP, JSON, arrays, IDs and byte bounds defensively", async () => {
    const statusCases = ["", "DOWNLOADED", " downloaded ", "mystery"];
    for (const status of statusCases) {
      const current = setup([json({ id: "torrent-1" }), json(info(status)), noContent]);
      await assert.rejects(() => current.resolver.resolve(request()), (error: unknown) => error instanceof RealDebridResolverError && error.code === "unknown_status"); current.transport.assertExhausted();
    }
    const invalidFiles: Array<[unknown, string]> = [
      [[{ id: 0, path: "/movie.mkv", bytes: 1, selected: 0 }], "file_id_invalid"], [[{ id: -1, path: "/movie.mkv", bytes: 1, selected: 0 }], "file_id_invalid"],
      [[{ id: 1.5, path: "/movie.mkv", bytes: 1, selected: 0 }], "file_id_invalid"], [[{ id: Number.NaN, path: "/movie.mkv", bytes: 1, selected: 0 }], "file_id_invalid"],
      [[{ id: Number.POSITIVE_INFINITY, path: "/movie.mkv", bytes: 1, selected: 0 }], "file_id_invalid"], [[{ id: 1, path: "/movie.mkv", bytes: MAX_FILE_BYTES + 1, selected: 0 }], "file_list_invalid"],
      [[{ id: 1, path: "/movie.mkv", bytes: 1 }], "file_list_invalid"],
      [Array.from({ length: 101 }, (_, index) => ({ id: index + 1, path: `/${index}.mkv`, bytes: 1, selected: 0 })), "file_list_too_many"],
    ];
    for (const path of ["", "/", "movie.mkv", "//movie.mkv", "/../movie.mkv", "/./movie.mkv", "/directory/../movie.mkv", "/directory//movie.mkv", "/directory\\movie.mkv", "/%2e%2e/movie.mkv", "/movie%20name.mkv", "/movie\u0000.mkv", "/video∕file.mkv", "/video⁄file.mkv", "/directory./movie.mkv", "/directory /movie.mkv", `/${"a".repeat(256)}/movie.mkv`]) {
      invalidFiles.push([[{ id: 1, path, bytes: 1, selected: 0 }], "file_list_invalid"]);
    }
    invalidFiles.push([[{ id: 1, path: "/movie.mkv", bytes: 1, selected: 2 }], "file_list_invalid"]);
    for (const [files, code] of invalidFiles) {
      const current = setup([json({ id: "torrent-1" }), json(info("downloaded", files)), noContent]);
      await assert.rejects(() => current.resolver.resolve(request()), (error: unknown) => error instanceof RealDebridResolverError && error.code === code); current.transport.assertExhausted();
    }
    const missing = setup([json({ id: "torrent-1" }), json({ id: "torrent-1", status: "downloaded", links: [] }), noContent]);
    await assert.rejects(() => missing.resolver.resolve(request()), (error: unknown) => error instanceof RealDebridResolverError && error.code === "file_list_missing"); missing.transport.assertExhausted();
  });

  it("recognizes compressing and uploading as bounded transient statuses", async () => {
    for (const status of ["compressing", "uploading"] as const) {
      let delays = 0;
      const current = setup([json({ id: "torrent-1" }), json(info("waiting_files_selection")), noContent,
        json(info(status, [{ ...FILE, selected: 1 }])), json(selected()), json({ download: "https://media.example.invalid/movie.mkv" }), noContent],
      { delay: async () => { delays += 1; } });
      assert.notEqual(await current.resolver.resolve(request()), null);
      assert.equal(delays, 1);
      current.transport.assertExhausted();
    }
  });

  it("distinguishes HTTP and content decoder error codes", async () => {
    const cases: Array<[RealDebridTransportResponse, string]> = [
      [{ status: 401, contentType: "application/json", bodyText: "{}" }, "unexpected_http_status"],
      [{ status: 500, contentType: "application/json", bodyText: "{}" }, "unexpected_http_status"],
      [{ status: 200, contentType: "", bodyText: "{}" }, "invalid_content_type"],
      [{ status: 200, contentType: "text/plain", bodyText: "{}" }, "invalid_content_type"],
      [{ status: 200, contentType: "application/json", bodyText: "" }, "invalid_json"],
      [{ status: 200, contentType: "application/json", bodyText: "{" }, "invalid_json"],
      [{ status: 200, contentType: "application/json", bodyText: "x".repeat(1_048_577) }, "response_too_large"],
      [json({}), "invalid_response"],
    ];
    for (const [response, code] of cases) {
      const current = setup([response]); await assert.rejects(() => current.resolver.resolve(request()), (error: unknown) => error instanceof RealDebridResolverError && error.code === code); current.transport.assertExhausted();
    }
    const deleteOnly = new FakeRealDebridTransport([noContent]); await new RealDebridApiClient(deleteOnly, TOKEN).delete("torrent-1", new AbortController().signal); deleteOnly.assertExhausted();
  });

  it("selects films and exact single-marker episodes with a conservative path policy", () => {
    const file = (id: number, path: string, bytes = 1) => ({ id, path, bytes, selected: false });
    assert.equal(selectRealDebridFile([file(1, "small.mkv", 1), file(2, "large.mkv", 2)], { id: "tt0000001", type: "movie" })?.id, 2);
    const episodeCases: Array<[string, boolean]> = [
      ["Show.S01E01.mkv", true], ["show.s1e1.MKV", true], ["Show.S001E0001.mkv", true],
      ["Show.S02E01.mkv", false], ["Show.S01E02.mkv", false], ["Show.S01E010.mkv", false],
      ["Show.S01.mkv", false], ["S01E01/feature.mkv", false], ["Show.S01E01E02.mkv", false],
      ["Show.S01E01.S01E02.mkv", false], ["Show.S01E01.sample.mkv", false],
    ];
    for (const [path, accepted] of episodeCases) assert.equal(selectRealDebridFile([file(1, path)], { id: "tt0000001:1:1", type: "series" }) !== null, accepted, path);
    assert.equal(selectRealDebridFile([file(2, "z.S01E01.mkv", 2), file(1, "a.S01E01.mkv", 2)], { id: "tt0000001:1:1", type: "series" })?.id, 1);
    assert.equal(selectRealDebridFile([file(1, "Season.01.pack.mkv")], { id: "tt0000001:1:1", type: "series" }), null);
    const unsafe = ["/x.mkv", "C:\\x.mkv", "\\\\server\\x.mkv", "../x.mkv", "%2e.mkv", "x\u0000.mkv", "x∕y.mkv", "folder./x.mkv", "folder /x.mkv", `${"a".repeat(256)}/x.mkv`];
    for (const path of unsafe) assert.equal(selectRealDebridFile([file(1, path)], { id: "tt0000001", type: "movie" }), null, path);
  });

  it("rejects forbidden final URLs and sanitizes arbitrary transport messages", async () => {
    for (const download of ["magnet:?x", "http://localhost/x", "http://10.0.0.1/x", "https://u:p@media.invalid/x"]) {
      const current = setup([json({ id: "torrent-1" }), json(info("downloaded")), noContent, json(selected()), json({ download }), noContent]);
      await assert.rejects(() => current.resolver.resolve(request()), (error: unknown) => error instanceof RealDebridResolverError && error.code === "invalid_final_url"); current.transport.assertExhausted();
    }
    const secret = `${TOKEN} ${MAGNET}`; const current = setup([new Error(secret)], { cleanup: false });
    await assert.rejects(() => current.resolver.resolve(request()), (error: unknown) => error instanceof RealDebridResolverError && error.code === "transport_error" && !error.message.includes(secret)); current.transport.assertExhausted();
  });

  it("deep-clones fake responses and enforces strict queue exhaustion", async () => {
    const mutable = { status: 200, contentType: "application/json", bodyText: JSON.stringify({ id: "torrent-1" }) };
    const transport = new FakeRealDebridTransport([mutable]); mutable.bodyText = "mutated";
    assert.equal(await new RealDebridApiClient(transport, TOKEN).addMagnet(MAGNET, new AbortController().signal), "torrent-1"); transport.assertExhausted();
    assert.throws(() => new FakeRealDebridTransport([noContent]).assertExhausted(), /remain/);
    await assert.rejects(() => new FakeRealDebridTransport([]).request({ baseUrl: "https://api.real-debrid.com/rest/1.0", method: "GET", pathname: "/x", redirect: "error", headers: {}, signal: new AbortController().signal }), /Unexpected/);
  });

  it("models a fixed HTTPS base, disabled redirects and form-encoded POST without token in body", async () => {
    const transport = {
      async request(value: import("../src/providers/torrentIndexer/realDebridApiClient.js").RealDebridTransportRequest) {
        assert.equal(value.baseUrl, "https://api.real-debrid.com/rest/1.0");
        assert.equal(value.redirect, "error");
        assert.equal(value.headers["Content-Type"], "application/x-www-form-urlencoded");
        assert.equal(value.headers.Authorization, `Bearer ${TOKEN}`);
        assert.deepEqual(Object.keys(value.body ?? {}), ["magnet"]);
        assert.equal(JSON.stringify(value.body).includes(TOKEN), false);
        return json({ id: "torrent-1" });
      },
    };
    assert.equal(await new RealDebridApiClient(transport, TOKEN).addMagnet(MAGNET, new AbortController().signal), "torrent-1");
  });

  it("validates resolver options and keeps the existing provider default tests intact", () => {
    for (const options of [{ pollAttempts: 0 }, { pollAttempts: 11 }, { totalTimeoutMs: 0 }, { totalTimeoutMs: 60_001 }, { cleanupTimeoutMs: 0 }, { cleanupTimeoutMs: 5_001 }]) {
      assert.throws(() => setup([], options).resolver, (error: unknown) => error instanceof RealDebridResolverError && error.code === "invalid_configuration");
    }
  });
});
