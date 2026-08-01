import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  ALLOWED_INDEXERS,
  buildPublicProbeUrl,
  parseAllowedIndexer,
  PROBE_MAX_RESPONSE_BYTES,
  runPublicProbe,
} from "../lab/torrent-indexer-public-probe/publicProbe.js";

function jsonBodyWithExactBytes(bytes: number): string {
  const prefix = '{"results":[],"padding":"';
  const suffix = '"}';
  return `${prefix}${"x".repeat(bytes - prefix.length - suffix.length)}${suffix}`;
}

describe("torrent-indexer public probe", () => {
  it("requires exactly one allowlisted indexer", () => {
    for (const indexer of ALLOWED_INDEXERS) assert.equal(parseAllowedIndexer(indexer), indexer);
    for (const invalid of [
      undefined, "", "other", "../bludv", "..", ".", "a/../bludv", "bludv/other",
      "bludv\\other", "%2f", "%2F", "%5c", "%252f", "bludv?x=1", "bludv&x=1",
      "bludv#fragment", " bludv", "bludv ", "bludv\n", "bludv\0", ["bludv", "rede_torrent"],
    ]) {
      assert.throws(() => parseAllowedIndexer(invalid), /exactly one/);
    }
  });

  it("builds only the fixed public endpoint and query", () => {
    const url = new URL(buildPublicProbeUrl("bludv"));
    assert.equal(url.origin, "https://torrent-indexer.darklyn.org");
    assert.equal(url.pathname, "/indexers/bludv");
    assert.deepEqual([...url.searchParams.entries()], [
      ["q", "Big Buck Bunny"], ["filter_results", "true"], ["limit", "1"],
    ]);
  });

  it("covers every response category through one injected fetch per scenario", async () => {
    const secret = "magnet:?xt=urn:btih:must-not-leak";
    const scenarios = [
      { body: JSON.stringify({ count: 1, indexed_count: 1, results: [{ title: "hidden", magnet_link: secret }] }), status: 200, category: "OK_RESULT" },
      { body: '{"count":0,"indexed_count":0,"results":[]}', status: 200, category: "OK_ZERO_RESULTS" },
      { body: '{"results":[]}', status: 500, category: "HTTP_ERROR" },
      { body: "not-json", status: 200, category: "INVALID_JSON" },
    ] as const;
    for (const scenario of scenarios) {
      let calls = 0;
      const report = await runPublicProbe("bludv", async () => {
        calls += 1;
        return new Response(scenario.body, { status: scenario.status });
      });
      assert.equal(calls, 1);
      assert.equal(report.category, scenario.category);
      assert.equal(JSON.stringify(report).includes(secret), false);
      assert.equal(JSON.stringify(report).includes("hidden"), false);
    }
  });

  it("classifies only a timeout signal as TIMEOUT and keeps transport errors separate", async () => {
    let timeoutCalls = 0;
    const timeoutSignal = AbortSignal.timeout(1);
    const timeout = await runPublicProbe("bludv", async (_input, init) => {
      timeoutCalls += 1;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }, timeoutSignal);
    assert.equal(timeoutCalls, 1);
    assert.equal(timeout.category, "TIMEOUT");
    assert.equal(timeout.http, null);

    let transportCalls = 0;
    const transport = await runPublicProbe("bludv", async () => {
      transportCalls += 1;
      throw new TypeError("synthetic transport failure without payload");
    });
    assert.equal(transportCalls, 1);
    assert.equal(transport.category, "HTTP_ERROR");
    assert.equal(transport.http, null);
  });

  it("accepts exactly 1 MiB and rejects the next byte while preserving safe metadata", async () => {
    for (const [bytes, category] of [
      [PROBE_MAX_RESPONSE_BYTES, "OK_ZERO_RESULTS"],
      [PROBE_MAX_RESPONSE_BYTES + 1, "RESPONSE_TOO_LARGE"],
    ] as const) {
      let calls = 0;
      const report = await runPublicProbe("bludv", async () => {
        calls += 1;
        return new Response(jsonBodyWithExactBytes(bytes), { status: 200 });
      });
      assert.equal(calls, 1);
      assert.equal(report.category, category);
      assert.equal(report.http, 200);
      assert.equal(report.responseBytes, bytes);
      assert.equal(JSON.stringify(report).includes("xxxxx"), false);
    }
  });

  it("does not confuse ordinary abort or response read failure with timeout", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("manual cancellation", "AbortError"));
    let calls = 0;
    const report = await runPublicProbe("bludv", async (_input, init) => {
      calls += 1;
      throw init?.signal?.reason;
    }, controller.signal);
    assert.equal(calls, 1);
    assert.equal(report.category, "HTTP_ERROR");
    assert.equal(report.http, null);
  });

  it("produces only sanitized report fields", async () => {
    const report = await runPublicProbe("bludv", async () => new Response('{"count":0,"indexed_count":0,"results":[]}'));
    assert.deepEqual(Object.keys(report), [
      "indexer", "http", "durationMs", "responseBytes", "validJson",
      "count", "indexedCount", "resultCount", "category",
    ]);
  });

  it("performs one injected request, rejects redirects and does not follow response data", async () => {
    let calls = 0;
    const report = await runPublicProbe("bludv", async (_input, init) => {
      calls += 1;
      assert.equal(init?.redirect, "error");
      return new Response('{"results":[]}', { status: 200 });
    });
    assert.equal(calls, 1);
    assert.equal(report.category, "OK_ZERO_RESULTS");
  });

  it("keeps manual scripts single-shot without loops or forbidden endpoints", async () => {
    for (const name of ["probe.sh", "probe.ps1"]) {
      const script = await readFile(new URL(`../lab/torrent-indexer-public-probe/scripts/${name}`, import.meta.url), "utf8");
      assert.equal((script.match(/PUBLIC_PROBE_ONCE/g) ?? []).length, 1);
      assert.doesNotMatch(script, /(?:^|\n)\s*(?:for|foreach|while)\b|RETRY_COUNT|MAX_RETRIES/i);
      assert.doesNotMatch(script, /\/search|\/indexers\/manual|\/ui/);
      assert.match(script, /run --rm -T probe/);
    }
  });
});
