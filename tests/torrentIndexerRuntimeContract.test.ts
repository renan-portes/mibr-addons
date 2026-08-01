import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  analyzeAndDeleteRawResponse,
  AUTHORIZED_INDEXER,
  AUTHORIZED_TERM,
  assertResponseSize,
  CONTRACT_LIMIT,
  CONTRACT_MAX_RESPONSE_BYTES,
  CONTRACT_TIMEOUT_SECONDS,
  classifyDiagnostic,
  correlateRuntimeLogs,
  createSanitizedErrorDiagnostic,
  createRuntimeContractReport,
  diagnoseAndDeleteTemporaryFiles,
  parseRuntimeInteger,
  sanitizeDiagnosticMessage,
  validateRuntimeContractConfig,
} from "../lab/torrent-indexer-runtime/runtimeContractReport.js";
import { runOfflineContextFlow } from "../lab/torrent-indexer-runtime/contextCancellationProbe.js";

const VALID_CONFIG = {
  authorizationConfirmed: true,
  indexer: AUTHORIZED_INDEXER,
  term: AUTHORIZED_TERM,
  limit: CONTRACT_LIMIT,
  timeoutSeconds: CONTRACT_TIMEOUT_SECONDS,
  maxResponseBytes: CONTRACT_MAX_RESPONSE_BYTES,
};

describe("torrent-indexer runtime contract laboratory", () => {
  it("reproduces normal, parent, timeout, and premature cancellation around the fallback offline", async () => {
    let directRequests = 0;
    let fallbackPosts = 0;
    let activeRequests = 0;
    let blockDirect = false;
    let releaseDirect: (() => void) | undefined;
    let directReceived: (() => void) | undefined;

    const directServer = createServer(async (_request, response) => {
      directRequests++;
      activeRequests++;
      response.on("close", () => activeRequests--);
      directReceived?.();
      if (blockDirect) await new Promise<void>((resolve) => { releaseDirect = resolve; });
      if (!response.destroyed) response.end("<html>Just a moment</html>");
    });
    const flareServer = createServer((_request, response) => {
      fallbackPosts++;
      activeRequests++;
      response.on("close", () => activeRequests--);
      response.end("<html>solved</html>");
    });
    await Promise.all([
      new Promise<void>((resolve) => directServer.listen(0, "127.0.0.1", resolve)),
      new Promise<void>((resolve) => flareServer.listen(0, "127.0.0.1", resolve)),
    ]);
    const directEndpoint = `http://127.0.0.1:${(directServer.address() as AddressInfo).port}`;
    const flaresolverrEndpoint = `http://127.0.0.1:${(flareServer.address() as AddressInfo).port}/v1`;

    try {
      const normal = await runOfflineContextFlow({
        directEndpoint, flaresolverrEndpoint, signal: new AbortController().signal,
      });
      assert.equal(normal.error, null);
      assert.equal(normal.fallbackCalls, 1);
      assert.equal(fallbackPosts, 1);

      const parent = new AbortController();
      blockDirect = true;
      const received = new Promise<void>((resolve) => { directReceived = resolve; });
      const parentRun = runOfflineContextFlow({ directEndpoint, flaresolverrEndpoint, signal: parent.signal });
      await received;
      parent.abort("parent-canceled");
      const parentResult = await parentRun;
      releaseDirect?.();
      assert.match(parentResult.error ?? "", /context canceled/);
      assert.equal(parentResult.fallbackCalls, 1);
      assert.equal(fallbackPosts, 1);
      assert.equal(parentResult.markers.at(-1)?.cause, "PARENT_CANCELED");

      blockDirect = false;
      directReceived = undefined;
      const premature = new AbortController();
      const prematureResult = await runOfflineContextFlow({
        directEndpoint,
        flaresolverrEndpoint,
        signal: premature.signal,
        beforeFallback: () => premature.abort("parent-canceled"),
      });
      assert.match(prematureResult.error ?? "", /context canceled/);
      assert.equal(prematureResult.fallbackCalls, 1);
      assert.equal(fallbackPosts, 1);

      const timeout = new AbortController();
      const timeoutResult = await runOfflineContextFlow({
        directEndpoint,
        flaresolverrEndpoint,
        signal: timeout.signal,
        deadlineAtMs: Date.now() + 5_000,
        beforeFallback: () => timeout.abort(new DOMException("deadline", "TimeoutError")),
      });
      assert.match(timeoutResult.error ?? "", /context canceled/);
      assert.equal(timeoutResult.markers.at(-1)?.cause, "TIMEOUT");
      assert.equal(timeoutResult.markers.every((event) => Object.keys(event).every((key) => [
        "stage", "contextState", "cause", "deadlinePresent", "remainingMsRounded",
        "fallbackStarted", "postV1Started", "postV1Completed", "durationMs",
      ].includes(key))), true);
      assert.equal(fallbackPosts, 1);

      const guarded = new AbortController();
      const guardedResult = await runOfflineContextFlow({
        directEndpoint,
        flaresolverrEndpoint,
        signal: guarded.signal,
        beforeFallback: () => guarded.abort("parent-canceled"),
        skipFallbackWhenCanceled: true,
      });
      assert.equal(guardedResult.fallbackCalls, 0);
      assert.equal(fallbackPosts, 1);
      assert.equal(directRequests, 5);
    } finally {
      releaseDirect?.();
      await Promise.all([
        new Promise<void>((resolve, reject) => directServer.close((error) => error ? reject(error) : resolve())),
        new Promise<void>((resolve, reject) => flareServer.close((error) => error ? reject(error) : resolve())),
      ]);
    }
    assert.equal(activeRequests, 0);
  });

  it("classifies sanitized runtime diagnostics", () => {
    const cases = [
      ["Failed to list FlareSolverr sessions", "FLARESOLVERR"],
      ["response is a challange", "FLARESOLVERR_CHALLENGE_UNRESOLVED"],
      ["response is a challenge", "FLARESOLVERR_CHALLENGE_UNRESOLVED"],
      ["DNS name resolution failed", "DNS_NETWORK"],
      ["external HTTP status code 502", "EXTERNAL_HTTP"],
      ["request timeout exceeded", "TIMEOUT"],
      ["scraper selector parse failed", "PARSER_SCRAPER"],
      ["Redis connection failed", "REDIS"],
      ["missing environment variable configuration", "CONFIGURATION"],
      ["unexpected failure", "UNKNOWN"],
    ] as const;
    for (const [message, category] of cases) assert.equal(classifyDiagnostic(message), category);
  });

  it("sanitizes error payloads and logs without leaking sensitive values", () => {
    const hash = "0123456789abcdef0123456789abcdef01234567";
    const sensitive = `https://example.invalid/path?q=Big%20Buck%20Bunny magnet:?xt=urn:btih:${hash} tracker=udp://tracker.invalid title=Secret filename=movie.mkv`;
    const diagnostic = createSanitizedErrorDiagnostic(
      JSON.stringify({ message: sensitive, details: "must-not-appear", title: "must-not-appear" }),
      [
        JSON.stringify({ level: "info", message: sensitive }),
        `torrent-indexer | ${JSON.stringify({ level: "error", time: "2026-08-01T12:00:00Z", client_ip: "192.0.2.10", path: "/indexers/bludv", query: "Big Buck Bunny", user_agent: "secret-agent", message: `FlareSolverr failed at ${sensitive}` })}`,
        JSON.stringify({ level: "fatal", message: "Redis timeout" }),
      ].join("\n"),
      "FLARESOLVERR_ADDRESS=PRESENT\nFLARESOLVERR_POOL_SIZE=PRESENT\nREDIS_HOST=PRESENT\nREQUEST_TIMEOUT_MILLISECONDS=PRESENT\nREDIS_HOST=secret-value",
      "AVAILABLE",
      "UNAVAILABLE",
    );
    const serialized = JSON.stringify(diagnostic);
    assert.deepEqual(diagnostic.allowedRootKeys, ["message"]);
    assert.equal(diagnostic.logErrors.length, 2);
    assert.deepEqual(diagnostic.logErrors[0], {
      category: "FLARESOLVERR",
      message: "A FlareSolverr operation failed.",
    });
    assert.deepEqual(diagnostic.environmentPresence, {
      FLARESOLVERR_ADDRESS: "PRESENT",
      FLARESOLVERR_POOL_SIZE: "PRESENT",
      REDIS_HOST: "PRESENT",
      REQUEST_TIMEOUT_MILLISECONDS: "PRESENT",
    });
    assert.equal(diagnostic.dns, "AVAILABLE");
    assert.equal(diagnostic.egress, "UNAVAILABLE");
    for (const value of ["torrent-indexer |", "2026-08-01", "client_ip", "192.0.2.10", "/indexers/bludv", "query", "secret-agent", "example.invalid", "magnet:?", hash, "tracker.invalid", "Secret", "movie.mkv", "must-not-appear", "secret-value", "Big%20Buck%20Bunny"]) {
      assert.equal(serialized.includes(value), false);
    }
  });

  it("keeps FLARESOLVERR_ADDRESS presence as metadata and classifies from execution evidence", () => {
    const diagnostic = createSanitizedErrorDiagnostic(
      '{"error":"response is a challange"}',
      '2026-08-01T12:00:00.117Z {"level":"error","message":"response is a challange"}',
      "FLARESOLVERR_ADDRESS=PRESENT\nFLARESOLVERR_POOL_SIZE=PRESENT\nREDIS_HOST=PRESENT\nREQUEST_TIMEOUT_MILLISECONDS=PRESENT",
      "AVAILABLE",
      "AVAILABLE",
    );
    const serialized = JSON.stringify(diagnostic);

    assert.equal(diagnostic.category, "FLARESOLVERR_CHALLENGE_UNRESOLVED");
    assert.equal(diagnostic.environmentPresence.FLARESOLVERR_ADDRESS, "PRESENT");
    assert.equal(diagnostic.logErrors.some((event) => event.category === "CONFIGURATION"), false);
    assert.equal(serialized.includes("URL is not configured"), false);
    assert.equal(serialized.includes("URL ausente"), false);
  });

  it("does not infer a configuration cause when FLARESOLVERR_ADDRESS is absent", () => {
    const diagnostic = createSanitizedErrorDiagnostic(
      '{"error":"unexpected failure"}',
      "",
      "FLARESOLVERR_ADDRESS=ABSENT\nFLARESOLVERR_POOL_SIZE=PRESENT\nREDIS_HOST=PRESENT\nREQUEST_TIMEOUT_MILLISECONDS=PRESENT",
      "AVAILABLE",
      "AVAILABLE",
    );

    assert.equal(diagnostic.environmentPresence.FLARESOLVERR_ADDRESS, "ABSENT");
    assert.equal(diagnostic.category, "UNKNOWN");
    assert.equal(diagnostic.logErrors.some((event) => event.category === "CONFIGURATION"), false);
  });

  it("ignores untimestamped, invalid, and pre-marker log lines completely", () => {
    const marker = "2026-08-01T12:00:00.000Z";
    const logs = [
      'Incoming request => POST /v1 body: {"url":"https://untimestamped.invalid/?query=secret"}',
      "not-a-timestamp Error solving the challenge Cookie: invalid-secret",
      "2026-99-99T99:99:99Z Response in 99 s Headers: invalid-secret",
      "2026-08-01T11:59:59.999Z Response in 88 s <html>old-secret</html>",
      '2026-08-01T12:00:00.100Z Incoming request => POST /v1 body: {"url":"https://current.invalid/?query=secret"}',
    ].join("\n");
    const events = correlateRuntimeLogs("", logs, marker);
    const diagnostic = createSanitizedErrorDiagnostic(
      '{"error":"response is a challange"}',
      logs,
      "FLARESOLVERR_ADDRESS=ABSENT\nFLARESOLVERR_POOL_SIZE=PRESENT\nREDIS_HOST=PRESENT\nREQUEST_TIMEOUT_MILLISECONDS=PRESENT",
      "AVAILABLE",
      "AVAILABLE",
      { torrentIndexerLogs: "", flaresolverrLogs: logs, marker },
    );
    const serialized = JSON.stringify(diagnostic);

    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      service: "FLARESOLVERR",
      stage: "INTERNAL_HTTP",
      result: "OBSERVED",
      statusHttp: null,
      durationMs: null,
    });
    assert.equal(diagnostic.category, "FLARESOLVERR_CHALLENGE_UNRESOLVED");
    assert.equal(diagnostic.logErrors.length, 0);
    for (const forbidden of ["untimestamped.invalid", "invalid-secret", "99 s", "88 s", "old-secret", "current.invalid", "query=secret"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it("correlates real FlareSolverr v3.3.21 success logs and access status", () => {
    const marker = "2026-08-01T12:00:00.000Z";
    const logs = [
      '2026-08-01T12:00:00.100Z Incoming request => POST /v1 body: {"url":"https://example.invalid/?q=secret","cookies":"secret"}',
      "2026-08-01T12:00:01.000Z Challenge solved!",
      "2026-08-01T12:00:02.445Z Response in 2.345 s",
      '2026-08-01T12:00:02.446Z 127.0.0.1 - - "POST /v1 HTTP/1.1" 200 -',
    ].join("\n");
    const events = correlateRuntimeLogs("", logs, marker);
    assert.deepEqual(events, [
      { service: "FLARESOLVERR", stage: "INTERNAL_HTTP", result: "SUCCESS", statusHttp: 200, durationMs: 2345 },
      { service: "FLARESOLVERR", stage: "CHALLENGE", result: "SUCCESS", statusHttp: null, durationMs: null },
    ]);
    assert.equal(JSON.stringify(events).includes("example.invalid"), false);
  });

  it("correlates real FlareSolverr v3.3.21 failure logs without crossing requests", () => {
    const marker = "2026-08-01T12:00:00.000Z";
    const logs = [
      "2026-08-01T12:00:00.100Z Incoming request => POST /v1 body: secret-first",
      "2026-08-01T12:00:00.200Z Error solving the challenge secret-first",
      "2026-08-01T12:00:05.300Z Response in 5.2 s",
      '2026-08-01T12:00:05.301Z 127.0.0.1 - - "POST /v1 HTTP/1.1" 500 -',
      "2026-08-01T12:00:06.000Z Incoming request => POST /v1 body: secret-second",
      "2026-08-01T12:00:07.000Z Response in 1 s",
      '2026-08-01T12:00:07.001Z 127.0.0.1 - - "POST /v1 HTTP/1.1" 200 -',
    ].join("\n");
    const events = correlateRuntimeLogs("", logs, marker);
    const requests = events.filter((event) => event.stage === "INTERNAL_HTTP");
    assert.deepEqual(requests, [
      { service: "FLARESOLVERR", stage: "INTERNAL_HTTP", result: "FAILURE", statusHttp: 500, durationMs: 5200 },
      { service: "FLARESOLVERR", stage: "INTERNAL_HTTP", result: "SUCCESS", statusHttp: 200, durationMs: 1000 },
    ]);
    assert.equal(events.some((event) => event.stage === "CHALLENGE" && event.result === "FAILURE"), true);
    assert.equal(JSON.stringify(events).includes("secret-"), false);
  });

  it("correlates only current FlareSolverr request events without leaking request data", () => {
    const marker = "2026-08-01T12:00:00.000Z";
    const oldSensitive = '2026-08-01T11:59:59.000Z {"level":"error","message":"unsupported protocol scheme","cookie":"old-secret"}';
    const currentSensitive = 'https://example.invalid/path?q=Big%20Buck%20Bunny Cookie: session=secret <html>secret</html> Headers: authorization=secret';
    const torrentLogs = [
      oldSensitive,
      `2026-08-01T12:00:00.100Z {"level":"info","message":"Created new FlareSolverr session","session":"secret"}`,
      `2026-08-01T12:00:00.117Z {"level":"error","message":"response is a challange","url":"${currentSensitive}"}`,
    ].join("\n");
    const flaresolverrLogs = [
      `2026-08-01T12:00:00.110Z Incoming request => POST /v1 ${currentSensitive}`,
      `2026-08-01T12:00:00.116Z Error solving the challenge in 6ms ${currentSensitive}`,
      "2026-08-01T12:00:00.117Z Response in 0.007 s",
      '2026-08-01T12:00:00.118Z 127.0.0.1 - - "POST /v1 HTTP/1.1" 200 -',
    ].join("\n");
    const events = correlateRuntimeLogs(torrentLogs, flaresolverrLogs, marker);
    const diagnostic = createSanitizedErrorDiagnostic(
      '{"error":"response is a challange"}',
      torrentLogs,
      "FLARESOLVERR_ADDRESS=ABSENT\nFLARESOLVERR_POOL_SIZE=PRESENT\nREDIS_HOST=PRESENT\nREQUEST_TIMEOUT_MILLISECONDS=PRESENT",
      "AVAILABLE",
      "AVAILABLE",
      { torrentIndexerLogs: torrentLogs, flaresolverrLogs, marker },
    );
    const serialized = JSON.stringify(diagnostic);

    assert.equal(diagnostic.category, "FLARESOLVERR_CHALLENGE_UNRESOLVED");
    assert.equal(diagnostic.environmentPresence.FLARESOLVERR_ADDRESS, "ABSENT");
    assert.equal(serialized.includes("URL is not configured"), false);
    assert.equal(events.some((event) => event.service === "TORRENT_INDEXER" && event.stage === "SESSION"), true);
    assert.equal(events.some((event) => event.service === "FLARESOLVERR" && event.stage === "INTERNAL_HTTP" && event.statusHttp === 200 && event.durationMs === 7), true);
    assert.equal(events.filter((event) => event.stage === "CHALLENGE" && event.result === "FAILURE").length, 2);
    assert.equal(events.some((event) => event.stage === "INTERNAL_HTTP" && event.result === "FAILURE"), false);
    assert.equal(diagnostic.logErrors.some((event) => event.category === "CONFIGURATION"), false);
    for (const forbidden of ["old-secret", "unsupported protocol scheme", "example.invalid", "Big%20Buck%20Bunny", "session=secret", "<html>", "authorization=secret", "Headers:"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it("limits messages and uses an opaque fallback for unsafe payloads", () => {
    assert.ok(sanitizeDiagnosticMessage("x".repeat(500)).length <= 200);
    const diagnostic = createSanitizedErrorDiagnostic('{"private":"value"}', "", "", "", "");
    assert.equal(diagnostic.payloadFormat, "JSON");
    assert.deepEqual(diagnostic.allowedRootKeys, []);
    assert.equal(diagnostic.message, "upstream returned an opaque error payload.");
  });

  it("deletes every raw diagnostic input after producing the sanitized report", async () => {
    const names = ["body", "logs", "environment", "dns", "egress", "torrentIndexerLogs", "flaresolverrLogs", "marker"] as const;
    const paths = Object.fromEntries(names.map((name) => [name, join(tmpdir(), `mibr-diagnostic-${process.pid}-${name}.tmp`)])) as Record<(typeof names)[number], string>;
    await Promise.all([
      writeFile(paths.body, '{"message":"Redis unavailable"}', { flag: "wx" }),
      writeFile(paths.logs, '2026-08-01T12:00:00.100Z {"level":"error","message":"Redis unavailable"}', { flag: "wx" }),
      writeFile(paths.environment, "REDIS_HOST=PRESENT", { flag: "wx" }),
      writeFile(paths.dns, "AVAILABLE", { flag: "wx" }),
      writeFile(paths.egress, "UNAVAILABLE", { flag: "wx" }),
      writeFile(paths.torrentIndexerLogs, "", { flag: "wx" }),
      writeFile(paths.flaresolverrLogs, "", { flag: "wx" }),
      writeFile(paths.marker, "2026-08-01T12:00:00.000Z", { flag: "wx" }),
    ]);
    const report = await diagnoseAndDeleteTemporaryFiles(paths);
    assert.equal(report.logErrors[0]?.category, "REDIS");
    await Promise.all(Object.values(paths).map((path) => assert.rejects(() => access(path))));
  });

  it("requires an explicitly authorized fixed term", () => {
    assert.throws(
      () => validateRuntimeContractConfig({ ...VALID_CONFIG, authorizationConfirmed: false }),
      /authorization/i,
    );
    assert.throws(
      () => validateRuntimeContractConfig({ ...VALID_CONFIG, term: "arbitrary commercial title" }),
      /authorized term/i,
    );
    assert.doesNotThrow(() => validateRuntimeContractConfig(VALID_CONFIG));
  });

  it("accepts only timeout 20 and rejects empty or invalid timeout values", () => {
    assert.doesNotThrow(() => validateRuntimeContractConfig({ ...VALID_CONFIG, timeoutSeconds: 20 }));
    for (const timeoutSeconds of [19, 21]) {
      assert.throws(() => validateRuntimeContractConfig({ ...VALID_CONFIG, timeoutSeconds }), /exactly 20/);
    }
    for (const value of [undefined, "", "invalid"]) {
      assert.throws(() => parseRuntimeInteger(value, "timeout"), /integer/);
    }
  });

  it("accepts only limit 1 and a fixed 1 MiB response maximum", () => {
    assert.doesNotThrow(() => validateRuntimeContractConfig({ ...VALID_CONFIG, limit: 1 }));
    assert.throws(() => validateRuntimeContractConfig({ ...VALID_CONFIG, limit: 2 }), /exactly 1/);
    assert.doesNotThrow(() => validateRuntimeContractConfig({ ...VALID_CONFIG, maxResponseBytes: 1_048_576 }));
    assert.throws(
      () => validateRuntimeContractConfig({ ...VALID_CONFIG, maxResponseBytes: 1_048_575 }),
      /exactly 1048576/,
    );
    assert.doesNotThrow(() => assertResponseSize(1_048_576));
    assert.throws(() => assertResponseSize(1_048_577), /exceeds/);
  });

  it("creates a type-and-key summary without sensitive values", () => {
    const sensitiveValues = [
      "Real title must not leak",
      "magnet:?xt=urn:btih:secret",
      "0123456789012345678901234567890123456789",
      "udp://tracker.example/announce",
      "https://content.example/file",
    ];
    const report = createRuntimeContractReport({
      count: 2,
      indexed_count: 1,
      results: [
        {
          title: sensitiveValues[0],
          magnet_link: sensitiveValues[1],
          info_hash: sensitiveValues[2],
          trackers: [sensitiveValues[3]],
          details: sensitiveValues[4],
          audio: [],
          seed_count: 0,
        },
        { title: " ", magnet_link: "", audio: ["pt"], seed_count: null },
      ],
    });
    const serialized = JSON.stringify(report);

    assert.equal(report.count, 2);
    assert.equal(report.indexedCount, 1);
    assert.equal(report.resultCount, 2);
    assert.equal(report.acceptedByParser, 1);
    assert.equal(report.rejectedByParser, 1);
    assert.ok(report.resultKeys.includes("magnet_link"));
    assert.deepEqual(report.observedTypes.audio, ["array"]);
    assert.equal(report.emptyValueCount, 4);
    assert.equal(report.status, "VALIDATED_WITH_RESULTS");
    for (const value of sensitiveValues) assert.equal(serialized.includes(value), false);
  });

  it("classifies zero results as partial without adding another query point", async () => {
    const report = createRuntimeContractReport({ results: [], count: 0, indexed_count: 0 });
    assert.equal(report.status, "PARTIAL_ZERO_RESULTS");
    assert.equal(report.acceptedByParser, 0);
    assert.equal(report.rejectedByParser, 0);

    for (const script of ["contract-test.sh", "contract-test.ps1"]) {
      const text = await readFile(
        new URL(`../lab/torrent-indexer-runtime/scripts/${script}`, import.meta.url),
        "utf8",
      );
      assert.equal((text.match(/CONTRACT_QUERY_ONCE/g) ?? []).length, 1);
      assert.match(text, /partial validation|Validação parcial/i);
      assert.match(text, /exit 2|ContractExitCode = 2/);
    }
  });

  it("deletes the temporary raw response after success and parse failure", async () => {
    for (const [suffix, content] of [["valid", '{"results":[]}'], ["invalid", "{"]] as const) {
      const path = join(tmpdir(), `mibr-runtime-contract-${process.pid}-${suffix}.json`);
      await writeFile(path, content, { encoding: "utf8", flag: "wx" });
      if (suffix === "valid") await analyzeAndDeleteRawResponse(path);
      else await assert.rejects(() => analyzeAndDeleteRawResponse(path), SyntaxError);
      await assert.rejects(() => access(path));
    }
  });

  it("contains one explicit query point and no retry in each manual script", async () => {
    for (const script of ["contract-test.sh", "contract-test.ps1"]) {
      const text = await readFile(
        new URL(`../lab/torrent-indexer-runtime/scripts/${script}`, import.meta.url),
        "utf8",
      );
      assert.equal((text.match(/CONTRACT_QUERY_ONCE/g) ?? []).length, 1);
      assert.equal((text.match(/indexers\//g) ?? []).length, 1);
      assert.doesNotMatch(text, /RETRY_COUNT|MAX_RETRIES|while\s+.*CONTRACT_QUERY|for\s+.*CONTRACT_QUERY/i);
      assert.match(text, /validate-config\.ts/);
      assert.doesNotMatch(text, /\bnpx\b/);
      assert.match(text, /(?:compose|docker compose)[^\n]*run --rm -T contract-tools/);
      assert.match(text, /remove|Remove-Item/);
      assert.match(text, /limit=1/);
      assert.match(text, /20 \* 1000|timeout[^\n]*20s/);
      assert.match(text, /1048576|maxBytes/);
      assert.match(text, /python3/);
      assert.match(text, /internal-http-client\.py/);
      assert.doesNotMatch(text, /\bnc\b/);
      assert.match(text, /diagnose-error\.ts/);
      assert.match(text, /FLARESOLVERR_ADDRESS/);
      assert.match(text, /FLARESOLVERR_POOL_SIZE/);
      assert.match(text, /REDIS_HOST/);
      assert.match(text, /REQUEST_TIMEOUT_MILLISECONDS/);
      assert.doesNotMatch(text, /FLARESOLVERR_URL/);
      assert.match(text, /query-marker\.txt/);
      assert.match(text, /logs --no-color --timestamps --since/);
      assert.match(text, /flaresolverr-logs\.raw/);
      assert.match(text, /torrent-indexer\.darklyn\.org\//);
      assert.doesNotMatch(text, /\/search|\/indexers\/manual|\/ui/);
    }
  });

  it("uses one EOF-reading internal Python request without netcat or redirects", async () => {
    const encodedQuery = "q=Big%20Buck%20Bunny&filter_results=true&limit=1";
    const client = await readFile(
      new URL("../lab/torrent-indexer-runtime/tools/internal-http-client.py", import.meta.url),
      "utf8",
    );
    for (const script of ["contract-test.sh", "contract-test.ps1"]) {
      const text = await readFile(
        new URL(`../lab/torrent-indexer-runtime/scripts/${script}`, import.meta.url),
        "utf8",
      );
      assert.equal((text.match(/Big%20Buck%20Bunny/g) ?? []).length, 1);
      assert.equal((text.match(new RegExp(encodedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 1);
      assert.doesNotMatch(text, /\bnc\b|Connection: close|printf[^\n]*GET \/indexers\//);
      assert.match(text, /exec[^\n]*flaresolverr[^\n]*python3|"flaresolverr", "python3"/);
      assert.match(text, /20[^\n]*1048576/);
      assert.equal((text.match(/CONTRACT_QUERY_ONCE/g) ?? []).length, 1);
    }
    assert.equal((client.match(/connection\.request\(/g) ?? []).length, 1);
    assert.match(client, /HTTPConnection\("torrent-indexer", 7006/);
    assert.match(client, /_http_vsn = 10/);
    assert.match(client, /while True:[\s\S]*response\.read\(64 \* 1024\)[\s\S]*if not chunk:[\s\S]*break/);
    assert.match(client, /max_bytes \+ 1 - len\(captured\)/);
    assert.ok(client.indexOf("response.read") < client.indexOf("connection.close"));
    assert.match(client, /HTTP_STATUS=.*file=sys\.stderr/);
    assert.match(client, /sys\.stdout\.buffer\.write\(captured\)/);
    assert.doesNotMatch(client, /urllib|redirect|Connection["']?\s*:\s*["']close/);
  });

  it("defines a locked-down, one-shot container for TypeScript tools", async () => {
    const compose = await readFile(
      new URL("../lab/torrent-indexer-runtime/compose.tools.yml", import.meta.url),
      "utf8",
    );
    const dockerfile = await readFile(
      new URL("../lab/torrent-indexer-runtime/Dockerfile.contract-tools", import.meta.url),
      "utf8",
    );
    assert.match(compose, /contract-tools:/);
    assert.match(compose, /network_mode: none/);
    assert.match(compose, /source: \.\.\/\.\./);
    assert.match(compose, /target: \/workspace[\s\S]*read_only: true/);
    assert.match(compose, /target: \/contract-input/);
    assert.match(compose, /no-new-privileges:true/);
    assert.match(compose, /cap_drop:[\s\S]*- ALL/);
    assert.doesNotMatch(compose, /docker\.sock/);
    assert.match(dockerfile, /FROM node:24\.4\.1-bookworm-slim/);
    assert.match(dockerfile, /npm ci --ignore-scripts/);
    assert.doesNotMatch(dockerfile, /:latest/);
  });

  it("defines a locked-down internal FlareSolverr dependency", async () => {
    const compose = await readFile(
      new URL("../lab/torrent-indexer-runtime/compose.yml", import.meta.url),
      "utf8",
    );
    const dockerfile = await readFile(
      new URL("../lab/torrent-indexer-runtime/Dockerfile.flaresolverr", import.meta.url),
      "utf8",
    );
    const entrypoint = await readFile(
      new URL("../lab/torrent-indexer-runtime/flaresolverr-entrypoint.sh", import.meta.url),
      "utf8",
    );
    const dockerignore = await readFile(
      new URL("../lab/torrent-indexer-runtime/Dockerfile.flaresolverr.dockerignore", import.meta.url),
      "utf8",
    );
    const redisBlock = compose.slice(compose.indexOf("  redis:"), compose.indexOf("\n  flaresolverr:"));
    const flaresolverrBlock = compose.slice(
      compose.indexOf("  flaresolverr:"),
      compose.indexOf("\n  torrent-indexer:"),
    );
    const torrentIndexerBlock = compose.slice(
      compose.indexOf("  torrent-indexer:"),
      compose.indexOf("\nnetworks:"),
    );
    assert.match(compose, /flaresolverr:[\s\S]*image: mibr-lab\/flaresolverr-runtime:v3\.3\.21/);
    assert.match(compose, /build:[\s\S]*context: \.[\s\S]*dockerfile: Dockerfile\.flaresolverr/);
    assert.match(compose, /flaresolverr:[\s\S]*user: "1000:1000"/);
    assert.match(flaresolverrBlock, /read_only: false/);
    assert.doesNotMatch(flaresolverrBlock, /read_only: true/);
    assert.match(redisBlock, /read_only: true/);
    assert.match(torrentIndexerBlock, /read_only: true/);
    assert.equal((compose.match(/read_only: false/g) ?? []).length, 1);
    assert.equal((compose.match(/read_only: true/g) ?? []).length, 2);
    assert.match(
      compose,
      /flaresolverr:[\s\S]*tmpfs:[\s\S]*\/app\/\.local:rw,exec,nosuid,nodev,size=64m,mode=0700,uid=1000,gid=1000/,
    );
    assert.match(compose, /flaresolverr:[\s\S]*no-new-privileges:true/);
    assert.match(compose, /flaresolverr:[\s\S]*cap_drop:[\s\S]*- ALL/);
    assert.match(compose, /flaresolverr:[\s\S]*mem_limit: 512m[\s\S]*cpus: 1\.0[\s\S]*pids_limit: 256/);
    assert.match(compose, /flaresolverr:[\s\S]*networks:[\s\S]*- runtime-contract/);
    assert.match(
      compose,
      /flaresolverr:[\s\S]*healthcheck:[\s\S]*test: \["CMD", "python3", "-c"/,
    );
    assert.match(torrentIndexerBlock, /FLARESOLVERR_ADDRESS: http:\/\/flaresolverr:8191/);
    assert.doesNotMatch(compose, /FLARESOLVERR_URL/);
    assert.match(compose, /depends_on:[\s\S]*flaresolverr:[\s\S]*condition: service_healthy/);
    assert.doesNotMatch(compose, /flaresolverr:[\s\S]*?ports:/);
    assert.doesNotMatch(compose, /privileged:|docker\.sock|:latest|volumes:/);
    assert.match(dockerfile, /^FROM ghcr\.io\/flaresolverr\/flaresolverr:v3\.3\.21$/m);
    assert.match(dockerfile, /mv \/app\/chromedriver \/app\/chromedriver\.original/);
    assert.match(dockerfile, /ln -s \/app\/\.local\/chromedriver \/app\/chromedriver/);
    assert.match(dockerfile, /USER flaresolverr/);
    assert.doesNotMatch(dockerfile, /USER (?:0|root)/);
    assert.match(
      dockerfile,
      /ENTRYPOINT \["\/app\/flaresolverr-entrypoint\.sh", "\/usr\/bin\/dumb-init", "--"\]/,
    );
    assert.match(
      dockerfile,
      /CMD \["\/usr\/local\/bin\/python", "-u", "\/app\/flaresolverr\.py"\]/,
    );
    assert.doesNotMatch(dockerfile, /COPY\s+(?:--\S+\s+)*src|patch_exe|utils\.py|patcher\.py/);
    assert.match(entrypoint, /\[ "\$\(id -u\)" -eq 0 \]/);
    assert.match(entrypoint, /\[ ! -w "\$runtime_dir" \]/);
    assert.match(entrypoint, /cp "\$driver_original" "\$driver_runtime"/);
    assert.match(entrypoint, /chmod 0755 "\$driver_runtime"/);
    assert.match(entrypoint, /exec "\$@"/);
    assert.equal((entrypoint.match(/cp "\$driver_original" "\$driver_runtime"/g) ?? []).length, 1);
    assert.match(dockerignore, /^\*\*$/m);
    assert.match(dockerignore, /^!flaresolverr-entrypoint\.sh$/m);
  });

  it("defines isolated single-start FlareSolverr diagnostic scenarios", async () => {
    const diagnosticUrl = new URL("../lab/torrent-indexer-runtime/diagnostics/", import.meta.url);
    const [baseline, derived, capDrop, noNnp, writable, runner] = await Promise.all([
      readFile(new URL("compose.a.yml", diagnosticUrl), "utf8"),
      readFile(new URL("compose.b.yml", diagnosticUrl), "utf8"),
      readFile(new URL("compose.c-cap-drop.yml", diagnosticUrl), "utf8"),
      readFile(new URL("compose.c-no-nnp.yml", diagnosticUrl), "utf8"),
      readFile(new URL("compose.d.yml", diagnosticUrl), "utf8"),
      readFile(new URL("run-scenario.sh", diagnosticUrl), "utf8"),
    ]);
    const scenarios = [baseline, derived, capDrop, noNnp, writable];

    for (const scenario of scenarios) {
      assert.doesNotMatch(scenario, /ports:|privileged:|docker\.sock|volumes:|\/v1|indexers/);
      assert.match(scenario, /restart: "no"/);
      assert.match(scenario, /127\.0\.0\.1:8191/);
    }

    assert.match(baseline, /image: ghcr\.io\/flaresolverr\/flaresolverr:v3\.3\.21/);
    assert.doesNotMatch(baseline, /read_only:|cap_drop:|security_opt:|user:|build:/);
    assert.match(derived, /user: "1000:1000"[\s\S]*read_only: true/);
    assert.match(derived, /\/app\/\.local:rw,exec,nosuid,nodev,size=64m/);
    assert.match(derived, /no-new-privileges:true/);
    assert.doesNotMatch(derived, /cap_drop:/);
    assert.match(capDrop, /no-new-privileges:true[\s\S]*cap_drop:[\s\S]*- ALL/);
    assert.doesNotMatch(noNnp, /no-new-privileges|cap_drop:/);
    assert.match(writable, /user: "1000:1000"[\s\S]*read_only: false/);
    assert.doesNotMatch(writable, /cap_add:|cap_drop:/);
    assert.match(runner, /deadline=\$\(\(started_at \+ 120\)\)/);
    assert.match(runner, /docker top "\$container_id"/);
    assert.match(runner, /cat "\/proc\/\$pid\/status"/);
    assert.match(runner, /'\{\{\.RestartCount\}\}'/);
    assert.doesNotMatch(runner, /POST|\/v1|torrent-indexer|BluDV|indexers/);
  });

  it("uses idempotent POSIX signal cleanup and exits without resuming", async () => {
    const text = await readFile(
      new URL("../lab/torrent-indexer-runtime/scripts/contract-test.sh", import.meta.url),
      "utf8",
    );
    assert.match(text, /CLEANED_UP=0/);
    assert.match(text, /trap - EXIT INT TERM TSTP/);
    assert.match(text, /trap 'on_signal 130' INT/);
    assert.match(text, /trap 'on_signal 143' TERM/);
    assert.match(text, /trap 'on_signal 148' TSTP/);
    assert.match(text, /on_signal\(\)[\s\S]*exit "\$SIGNAL_STATUS"/);
    assert.match(text, /kill -TERM "-\$QUERY_PID"/);
    assert.match(text, /kill -KILL "-\$QUERY_PID"/);
    assert.match(text, /compose kill torrent-indexer/);
  });

  it("enforces the global timeout around a dedicated process group without retry", async () => {
    const text = await readFile(
      new URL("../lab/torrent-indexer-runtime/scripts/contract-test.sh", import.meta.url),
      "utf8",
    );
    const powershell = await readFile(
      new URL("../lab/torrent-indexer-runtime/scripts/contract-test.ps1", import.meta.url),
      "utf8",
    );
    assert.match(text, /setsid timeout --signal=TERM --kill-after=2s 20s docker compose/);
    assert.match(text, /QUERY_STATUS[\s\S]*(?:124|137)/);
    assert.match(text, /consulta excedeu 20 segundos/);
    assert.equal((text.match(/CONTRACT_QUERY_ONCE/g) ?? []).length, 1);
    assert.match(powershell, /WaitForExit\(20 \* 1000\)/);
    assert.match(powershell, /Kill\(\$true\)/);
    assert.match(powershell, /compose[\s\S]*kill torrent-indexer/);
    assert.equal((powershell.match(/CONTRACT_QUERY_ONCE/g) ?? []).length, 1);
  });

  it("keeps recovery cleanup independent from the contract-tools temporary mount", async () => {
    const baseCompose = await readFile(
      new URL("../lab/torrent-indexer-runtime/compose.yml", import.meta.url),
      "utf8",
    );
    const toolsCompose = await readFile(
      new URL("../lab/torrent-indexer-runtime/compose.tools.yml", import.meta.url),
      "utf8",
    );
    const readme = await readFile(
      new URL("../lab/torrent-indexer-runtime/README.md", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(baseCompose, /CONTRACT_TEMP_DIR|contract-tools/);
    assert.match(toolsCompose, /CONTRACT_TEMP_DIR/);
    assert.match(readme, /docker compose -f lab\/torrent-indexer-runtime\/compose\.yml down --remove-orphans/);
  });
});
