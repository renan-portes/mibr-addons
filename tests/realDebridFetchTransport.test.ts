import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REAL_DEBRID_API_BASE_URL, RealDebridApiClient, RealDebridResolverError, type RealDebridTransportRequest } from "../src/providers/torrentIndexer/realDebridApiClient.js";
import { RealDebridFetchTransport, isPublicRealDebridAddress, type RealDebridFetch, type RealDebridTransportClock } from "../src/providers/torrentIndexer/realDebridFetchTransport.js";

const TOKEN = "synthetic-credential-for-offline-test";
const PUBLIC_ADDRESSES = async () => ["93.184.216.34"] as const;

function transportRequest(overrides: Partial<RealDebridTransportRequest> = {}): RealDebridTransportRequest {
  return { baseUrl: REAL_DEBRID_API_BASE_URL, method: "GET", pathname: "/torrents/info/synthetic-id", redirect: "error", headers: Object.freeze({ Authorization: `Bearer ${TOKEN}` }), signal: new AbortController().signal, ...overrides };
}
function response(body: string, status = 200, contentType = "application/json"): Response { return new Response(body, { status, headers: { "Content-Type": contentType } }); }
function infoBody(): string { return JSON.stringify({ id: "synthetic-id", status: "downloaded", files: [], links: [] }); }
function clientWith(fetch: RealDebridFetch, options: { timeoutMs?: number } = {}) { return new RealDebridApiClient(new RealDebridFetchTransport({ fetch, lookup: PUBLIC_ADDRESSES, ...options }), TOKEN); }
async function rejectsCode(operation: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(operation, (error: unknown) => error instanceof RealDebridResolverError && error.code === code && !error.message.includes(TOKEN));
}

class TrackingClock implements RealDebridTransportClock {
  private nextId = 0;
  readonly timers = new Map<number, { readonly callback: () => void; readonly milliseconds: number }>();
  setTimeout(callback: () => void, milliseconds: number): unknown { const id = ++this.nextId; this.timers.set(id, { callback, milliseconds }); return id; }
  clearTimeout(handle: unknown): void { this.timers.delete(handle as number); }
  fire(milliseconds: number): void {
    const entry = [...this.timers.entries()].find(([, timer]) => timer.milliseconds === milliseconds);
    assert.notEqual(entry, undefined, `missing ${milliseconds}ms timer`);
    this.timers.delete(entry![0]); entry![1].callback();
  }
}

function trackedSignal(): { readonly controller: AbortController; readonly counts: { added: number; removed: number } } {
  const controller = new AbortController(); const counts = { added: 0, removed: 0 };
  const signal = controller.signal;
  const add = signal.addEventListener.bind(signal); const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = ((...args: Parameters<AbortSignal["addEventListener"]>) => { counts.added += 1; return add(...args); }) as AbortSignal["addEventListener"];
  signal.removeEventListener = ((...args: Parameters<AbortSignal["removeEventListener"]>) => { counts.removed += 1; return remove(...args); }) as AbortSignal["removeEventListener"];
  return { controller, counts };
}

async function settleMicrotasks(): Promise<void> { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
async function settleAsyncEvents(): Promise<void> { await settleMicrotasks(); await new Promise<void>((resolve) => setImmediate(resolve)); }
async function waitForTimer(clock: TrackingClock, milliseconds: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ([...clock.timers.values()].some((timer) => timer.milliseconds === milliseconds)) return;
    await Promise.resolve();
  }
  assert.fail(`missing ${milliseconds}ms timer`);
}

describe("RealDebridFetchTransport offline HTTPS boundary", () => {
  it("uses only the fixed base, Bearer header, disabled redirects and encoded form body", async () => {
    let capturedUrl = ""; let captured: RequestInit | undefined;
    const client = clientWith(async (url, init) => { capturedUrl = url; captured = init; return response(JSON.stringify({ id: "synthetic-id" })); });
    assert.equal(await client.addMagnet("magnet:synthetic-offline-value", new AbortController().signal), "synthetic-id");
    assert.equal(capturedUrl, `${REAL_DEBRID_API_BASE_URL}/torrents/addMagnet`);
    assert.equal(captured?.redirect, "error");
    assert.equal((captured?.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`);
    assert.equal(String(captured?.body).includes(TOKEN), false);
    assert.equal(capturedUrl.includes(TOKEN), false);
  });

  it("rejects replacement of the fixed base or redirect policy before fetch", async () => {
    let calls = 0;
    const transport = new RealDebridFetchTransport({ fetch: async () => { calls += 1; return response("{}"); }, lookup: PUBLIC_ADDRESSES });
    await rejectsCode(() => transport.request(transportRequest({ baseUrl: "https://example.invalid" as typeof REAL_DEBRID_API_BASE_URL })), "invalid_configuration");
    await rejectsCode(() => transport.request(transportRequest({ redirect: "follow" as "error" })), "invalid_configuration");
    assert.equal(calls, 0);
  });

  it("accepts only the account endpoint and five modeled candidate endpoint shapes", async () => {
    const accepted = ["/user", "/torrents/addMagnet", "/torrents/info/id_1", "/torrents/selectFiles/id-1", "/unrestrict/link", "/torrents/delete/id"];
    for (const pathname of accepted) await new RealDebridFetchTransport({ lookup: PUBLIC_ADDRESSES, fetch: async () => response("{}") }).request(transportRequest({ pathname }));
    const rejected = ["", "x", "/../x", "/./x", "//host/x", "/x%2fy", "/x%2ey", "/x\\y", "/x\u0000y", "/x?token=y", "/x#fragment", "https://host/x", "/torrents/info/a/b", `/torrents/info/${"a".repeat(201)}`];
    for (const pathname of rejected) await rejectsCode(() => new RealDebridFetchTransport({ lookup: PUBLIC_ADDRESSES, fetch: async () => { throw new Error("must not fetch"); } }).request(transportRequest({ pathname })), "invalid_configuration");
  });

  it("bounds a non-cooperative fetch and consumes its late result", async () => {
    let resolveLate!: (value: Response) => void;
    const late = new Promise<Response>((resolve) => { resolveLate = resolve; });
    await rejectsCode(() => clientWith(() => late, { timeoutMs: 15 }).info("synthetic-id", new AbortController().signal), "timeout");
    resolveLate(response(infoBody())); await Promise.resolve();
  });

  it("propagates parent cancellation without exposing arbitrary reasons", async () => {
    const started = Promise.withResolvers<void>();
    const client = clientWith((_url, init) => { started.resolve(); return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error(TOKEN)), { once: true })); });
    const controller = new AbortController(); const pending = client.info("synthetic-id", controller.signal);
    await started.promise; controller.abort(new Error(TOKEN)); await rejectsCode(() => pending, "canceled");
  });

  it("rejects invalid JSON, content type and bodies over 1 MiB", async () => {
    await rejectsCode(() => clientWith(async () => response("{")).info("synthetic-id", new AbortController().signal), "invalid_json");
    await rejectsCode(() => clientWith(async () => response(infoBody(), 200, "text/plain")).info("synthetic-id", new AbortController().signal), "invalid_content_type");
    await rejectsCode(() => clientWith(async () => response("x".repeat(1_048_577))).info("synthetic-id", new AbortController().signal), "response_too_large");
    await rejectsCode(() => clientWith(async () => new Response("", { status: 200, headers: { "Content-Type": "application/json", "Content-Length": "1048577" } })).info("synthetic-id", new AbortController().signal), "response_too_large");
  });

  it("handles 2xx, 4xx, 5xx and 429 without POST retry", async () => {
    assert.equal((await clientWith(async () => response(infoBody())).info("synthetic-id", new AbortController().signal)).id, "synthetic-id");
    for (const status of [400, 500]) await rejectsCode(() => clientWith(async () => response(JSON.stringify({ token: TOKEN }), status)).info("synthetic-id", new AbortController().signal), "unexpected_http_status");
    await rejectsCode(() => clientWith(async () => response("{}", 429)).info("synthetic-id", new AbortController().signal), "rate_limited");
    let postCalls = 0;
    await rejectsCode(() => clientWith(async (_url, init) => { if (init.method === "POST") postCalls += 1; return response("{}", 503); }).addMagnet("magnet:synthetic-offline-value", new AbortController().signal), "unexpected_http_status");
    assert.equal(postCalls, 1);
  });

  it("validates every DNS answer before fetch and accepts a synthetic public answer", async () => {
    let fetchCalls = 0;
    for (const address of ["127.0.0.1", "10.0.0.1", "169.254.1.1", "192.0.2.1", "224.0.0.1", "::1", "fe80::1", "fd00::1", "ff02::1", "::ffff:127.0.0.1"]) {
      const transport = new RealDebridFetchTransport({ lookup: async (hostname) => { assert.equal(hostname, "api.real-debrid.com"); return [address]; }, fetch: async () => { fetchCalls += 1; return response("{}"); } });
      await rejectsCode(() => transport.request(transportRequest()), "transport_error");
    }
    assert.equal(fetchCalls, 0);
    await new RealDebridFetchTransport({ lookup: PUBLIC_ADDRESSES, fetch: async () => { fetchCalls += 1; return response("{}"); } }).request(transportRequest());
    assert.equal(fetchCalls, 1);
    await rejectsCode(() => new RealDebridFetchTransport({ lookup: async () => [], fetch: async () => { throw new Error("must not fetch"); } }).request(transportRequest()), "transport_error");
    await rejectsCode(() => new RealDebridFetchTransport({ lookup: async () => ["93.184.216.34", "10.0.0.1"], fetch: async () => { throw new Error("must not fetch"); } }).request(transportRequest()), "transport_error");
    await rejectsCode(() => new RealDebridFetchTransport({ lookup: async () => ["93.184.216.34", "malformed"], fetch: async () => { throw new Error("must not fetch"); } }).request(transportRequest()), "transport_error");
    const duplicate = await new RealDebridFetchTransport({ lookup: async () => ["93.184.216.34", "93.184.216.34"], fetch: async () => response("{}") }).request(transportRequest());
    assert.equal(duplicate.status, 200);
  });

  it("classifies IPv4 and IPv6 special ranges conservatively", () => {
    for (const address of [
      "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.0.1", "172.16.0.1",
      "192.0.0.1", "192.0.2.1", "192.88.99.1", "192.168.0.1", "198.18.0.1", "198.51.100.1",
      "203.0.113.1", "224.0.0.1", "240.0.0.1", "255.255.255.255", "::", "::1", "::ffff:10.0.0.1",
      "64:ff9b::a00:1", "100::1", "2001:db8::1", "2001:10::1", "fc00::1", "fe80::1", "ff00::1",
    ]) assert.equal(isPublicRealDebridAddress(address), false, address);
    assert.equal(isPublicRealDebridAddress("93.184.216.34"), true);
    assert.equal(isPublicRealDebridAddress("2001:4860:4860::8888"), true);
    assert.equal(isPublicRealDebridAddress("not-an-address"), false);
  });

  it("validates timeout options deterministically", () => {
    for (const timeoutMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 60_001]) assert.throws(() => new RealDebridFetchTransport({ timeoutMs }), (error: unknown) => error instanceof RealDebridResolverError && error.code === "invalid_configuration");
  });

  it("bounds non-cooperative DNS and consumes late DNS rejection", async (context) => {
    const unhandled: unknown[] = []; const listener = (error: unknown) => unhandled.push(error); process.on("unhandledRejection", listener); context.after(() => process.off("unhandledRejection", listener));
    for (const rejectLate of [false, true]) {
      const clock = new TrackingClock(); const dns = Promise.withResolvers<readonly string[]>();
      const pending = new RealDebridFetchTransport({ clock, lookup: () => dns.promise, fetch: async () => { throw new Error("must not fetch"); } }).request(transportRequest());
      clock.fire(10_000); await rejectsCode(() => pending, "timeout");
      if (rejectLate) dns.reject(new Error(TOKEN)); else dns.resolve(["93.184.216.34"]);
      await settleAsyncEvents(); assert.equal(clock.timers.size, 0);
    }
    assert.deepEqual(unhandled, []);
  });

  it("bounds late fetch resolve/reject and removes the parent listener", async (context) => {
    const unhandled: unknown[] = []; const listener = (error: unknown) => unhandled.push(error); process.on("unhandledRejection", listener); context.after(() => process.off("unhandledRejection", listener));
    for (const rejectLate of [false, true]) {
      const clock = new TrackingClock(); const late = Promise.withResolvers<Response>(); const fetchStarted = Promise.withResolvers<void>(); const tracked = trackedSignal();
      const pending = new RealDebridFetchTransport({ clock, lookup: PUBLIC_ADDRESSES, fetch: () => { fetchStarted.resolve(); return late.promise; } }).request(transportRequest({ signal: tracked.controller.signal }));
      await fetchStarted.promise; clock.fire(10_000); await rejectsCode(() => pending, "timeout");
      if (rejectLate) late.reject(new Error(TOKEN)); else late.resolve(response("{}"));
      await settleAsyncEvents(); assert.equal(clock.timers.size, 0); assert.equal(tracked.counts.added, tracked.counts.removed);
    }
    assert.deepEqual(unhandled, []);
  });

  it("bounds a non-cooperative body read and reader cancellation", async (context) => {
    const unhandled: unknown[] = []; const listener = (error: unknown) => unhandled.push(error); process.on("unhandledRejection", listener); context.after(() => process.off("unhandledRejection", listener));
    const clock = new TrackingClock(); const read = Promise.withResolvers<{ done: false; value: Uint8Array } | { done: true; value?: undefined }>(); const readStarted = Promise.withResolvers<void>(); const cancel = Promise.withResolvers<void>();
    const reader = { read: () => { readStarted.resolve(); return read.promise; }, cancel: () => cancel.promise } as ReadableStreamDefaultReader<Uint8Array>;
    const fakeResponse = { status: 200, headers: new Headers({ "Content-Type": "application/json" }), body: { getReader: () => reader } } as Response;
    const pending = new RealDebridFetchTransport({ clock, lookup: PUBLIC_ADDRESSES, fetch: async () => fakeResponse }).request(transportRequest());
    await readStarted.promise; clock.fire(10_000); await waitForTimer(clock, 250); clock.fire(250);
    await rejectsCode(() => pending, "timeout");
    read.reject(new Error(TOKEN)); cancel.reject(new Error(TOKEN)); await settleAsyncEvents();
    assert.equal(clock.timers.size, 0); assert.deepEqual(unhandled, []);
  });

  it("limits reader cancellation after external cancellation without masking it", async () => {
    const clock = new TrackingClock(); const readStarted = Promise.withResolvers<void>(); const tracked = trackedSignal(); let cancelCalls = 0;
    const reader = {
      read: () => { readStarted.resolve(); return new Promise<{ done: true; value?: undefined }>(() => {}); },
      cancel: () => { cancelCalls += 1; return new Promise<void>(() => {}); },
    } as ReadableStreamDefaultReader<Uint8Array>;
    const fakeResponse = { status: 200, headers: new Headers({ "Content-Type": "application/json" }), body: { getReader: () => reader } } as Response;
    const pending = new RealDebridFetchTransport({ clock, lookup: PUBLIC_ADDRESSES, fetch: async () => fakeResponse }).request(transportRequest({ signal: tracked.controller.signal }));
    await readStarted.promise; tracked.controller.abort(new Error(TOKEN)); await waitForTimer(clock, 250); clock.fire(250);
    await rejectsCode(() => pending, "canceled"); assert.equal(cancelCalls, 1); assert.equal(clock.timers.size, 0); assert.equal(tracked.counts.added, tracked.counts.removed);
  });

  it("keeps reader cancellation best-effort after an oversized body", async () => {
    for (const outcome of ["resolve", "reject", "never"] as const) {
      const clock = new TrackingClock(); let cancelCalls = 0;
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array(1_048_577)); },
        cancel() { cancelCalls += 1; if (outcome === "resolve") return; if (outcome === "reject") return Promise.reject(new Error(TOKEN)); return new Promise<void>(() => {}); },
      });
      const pending = new RealDebridFetchTransport({ clock, lookup: PUBLIC_ADDRESSES, fetch: async () => new Response(body, { headers: { "Content-Type": "application/json" } }) }).request(transportRequest());
      await settleMicrotasks(); if (outcome === "never") { await waitForTimer(clock, 250); clock.fire(250); }
      await rejectsCode(() => pending, "response_too_large"); assert.equal(cancelCalls, 1); assert.equal(clock.timers.size, 0);
    }
  });

  it("enforces exact streaming byte limits without trusting Content-Length", async () => {
    const streamed = (sizes: readonly number[], declared?: string) => async () => {
      const body = new ReadableStream<Uint8Array>({ start(controller) { for (const size of sizes) controller.enqueue(new Uint8Array(size)); controller.close(); } });
      const headers: Record<string, string> = { "Content-Type": "application/json" }; if (declared !== undefined) headers["Content-Length"] = declared;
      return new Response(body, { headers });
    };
    const exact = await new RealDebridFetchTransport({ lookup: PUBLIC_ADDRESSES, fetch: streamed(Array.from({ length: 16 }, () => 65_536)) }).request(transportRequest());
    assert.equal(new TextEncoder().encode(exact.bodyText).byteLength, 1_048_576);
    await rejectsCode(() => new RealDebridFetchTransport({ lookup: PUBLIC_ADDRESSES, fetch: streamed([1_048_576, 1], "1") }).request(transportRequest()), "response_too_large");
    await rejectsCode(() => new RealDebridFetchTransport({ lookup: PUBLIC_ADDRESSES, fetch: streamed([1], "1048577") }).request(transportRequest()), "response_too_large");
    const multibyte = await new RealDebridFetchTransport({ lookup: PUBLIC_ADDRESSES, fetch: async () => response("é".repeat(524_288)) }).request(transportRequest());
    assert.equal(new TextEncoder().encode(multibyte.bodyText).byteLength, 1_048_576);
  });

  it("gives external cancellation priority over same-tick resolution and starts nothing afterward", async () => {
    const clock = new TrackingClock(); const dns = Promise.withResolvers<readonly string[]>(); const tracked = trackedSignal(); let fetchCalls = 0;
    const pending = new RealDebridFetchTransport({ clock, lookup: () => dns.promise, fetch: async () => { fetchCalls += 1; return response("{}"); } }).request(transportRequest({ signal: tracked.controller.signal }));
    dns.resolve(["93.184.216.34"]); queueMicrotask(() => tracked.controller.abort());
    await rejectsCode(() => pending, "canceled"); assert.equal(fetchCalls, 0); assert.equal(clock.timers.size, 0); assert.equal(tracked.counts.added, tracked.counts.removed);
  });

  it("gives timeout priority when timeout and DNS resolution share a tick", async () => {
    const clock = new TrackingClock(); const dns = Promise.withResolvers<readonly string[]>(); let fetchCalls = 0;
    const pending = new RealDebridFetchTransport({ clock, lookup: () => dns.promise, fetch: async () => { fetchCalls += 1; return response("{}"); } }).request(transportRequest());
    dns.resolve(["93.184.216.34"]); clock.fire(10_000);
    await rejectsCode(() => pending, "timeout"); assert.equal(fetchCalls, 0); assert.equal(clock.timers.size, 0);
  });

  it("cleans the main timer and parent listener on every transport and HTTP exit", async () => {
    const cases: readonly { readonly name: string; readonly lookup?: () => Promise<readonly string[]>; readonly fetch: RealDebridFetch; readonly expected?: string }[] = [
      { name: "success", fetch: async () => response(infoBody()) },
      { name: "dns error", lookup: async () => { throw new Error(TOKEN); }, fetch: async () => { throw new Error("must not fetch"); }, expected: "transport_error" },
      { name: "fetch error", fetch: async () => { throw new Error(TOKEN); }, expected: "transport_error" },
      { name: "HTTP", fetch: async () => response("{}", 500), expected: "unexpected_http_status" },
      { name: "content type", fetch: async () => response("{}", 200, "text/plain"), expected: "invalid_content_type" },
      { name: "JSON", fetch: async () => response("{"), expected: "invalid_json" },
      { name: "large body", fetch: async () => response("x".repeat(1_048_577)), expected: "response_too_large" },
    ];
    for (const current of cases) {
      const clock = new TrackingClock(); const tracked = trackedSignal();
      const client = new RealDebridApiClient(new RealDebridFetchTransport({ clock, lookup: current.lookup ?? PUBLIC_ADDRESSES, fetch: current.fetch }), TOKEN);
      const operation = () => client.info("synthetic-id", tracked.controller.signal);
      if (current.expected === undefined) assert.equal((await operation()).id, "synthetic-id"); else await rejectsCode(operation, current.expected);
      assert.equal(clock.timers.size, 0, current.name); assert.equal(tracked.counts.added, tracked.counts.removed, current.name);
    }
  });

  it("covers 204, empty 200, content types, statuses, Retry-After and header casing", async () => {
    const deleteClient = clientWith(async () => new Response(null, { status: 204 }));
    await deleteClient.delete("synthetic-id", new AbortController().signal);
    await rejectsCode(() => clientWith(async () => response("")).info("synthetic-id", new AbortController().signal), "invalid_json");
    await rejectsCode(() => clientWith(async () => new Response("{}", { status: 200 })).info("synthetic-id", new AbortController().signal), "invalid_content_type");
    await rejectsCode(() => clientWith(async () => response("{}", 200, "text/plain")).info("synthetic-id", new AbortController().signal), "invalid_content_type");
    assert.equal((await clientWith(async () => response(infoBody(), 200, "Application/JSON; Charset=UTF-8")).info("synthetic-id", new AbortController().signal)).id, "synthetic-id");
    for (const status of [400, 401, 403, 404, 500]) await rejectsCode(() => clientWith(async () => response("{}", status)).info("synthetic-id", new AbortController().signal), "unexpected_http_status");
    for (const retryAfter of ["2", "invalid"]) {
      let calls = 0; const client = clientWith(async () => { calls += 1; return new Response("{}", { status: 429, headers: { "content-type": "application/json", "retry-after": retryAfter } }); });
      await rejectsCode(() => client.info("synthetic-id", new AbortController().signal), "rate_limited"); assert.equal(calls, 1);
    }
  });
});
