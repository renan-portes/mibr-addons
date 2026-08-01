import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
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
  createSanitizedErrorDiagnostic,
  createRuntimeContractReport,
  diagnoseAndDeleteTemporaryFiles,
  parseRuntimeInteger,
  sanitizeDiagnosticMessage,
  validateRuntimeContractConfig,
} from "../lab/torrent-indexer-runtime/runtimeContractReport.js";

const VALID_CONFIG = {
  authorizationConfirmed: true,
  indexer: AUTHORIZED_INDEXER,
  term: AUTHORIZED_TERM,
  limit: CONTRACT_LIMIT,
  timeoutSeconds: CONTRACT_TIMEOUT_SECONDS,
  maxResponseBytes: CONTRACT_MAX_RESPONSE_BYTES,
};

describe("torrent-indexer runtime contract laboratory", () => {
  it("classifies sanitized runtime diagnostics", () => {
    const cases = [
      ["Failed to list FlareSolverr sessions", "FLARESOLVERR"],
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
        JSON.stringify({ level: "error", message: `FlareSolverr failed at ${sensitive}` }),
        JSON.stringify({ level: "fatal", message: "Redis timeout" }),
      ].join("\n"),
      "FLARESOLVERR_URL=ABSENT\nREDIS_HOST=PRESENT\nREDIS_HOST=secret-value",
      "AVAILABLE",
      "UNAVAILABLE",
    );
    const serialized = JSON.stringify(diagnostic);
    assert.deepEqual(diagnostic.allowedRootKeys, ["message"]);
    assert.equal(diagnostic.logErrors.length, 2);
    assert.deepEqual(diagnostic.environmentPresence, { FLARESOLVERR_URL: "ABSENT", REDIS_HOST: "PRESENT" });
    assert.equal(diagnostic.dns, "AVAILABLE");
    assert.equal(diagnostic.egress, "UNAVAILABLE");
    for (const value of ["example.invalid", "magnet:?", hash, "tracker.invalid", "Secret", "movie.mkv", "must-not-appear", "secret-value", "Big%20Buck%20Bunny"]) {
      assert.equal(serialized.includes(value), false);
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
    const names = ["body", "logs", "environment", "dns", "egress"] as const;
    const paths = Object.fromEntries(names.map((name) => [name, join(tmpdir(), `mibr-diagnostic-${process.pid}-${name}.tmp`)])) as Record<(typeof names)[number], string>;
    await Promise.all([
      writeFile(paths.body, '{"message":"Redis unavailable"}', { flag: "wx" }),
      writeFile(paths.logs, '{"level":"error","message":"Redis unavailable"}', { flag: "wx" }),
      writeFile(paths.environment, "REDIS_HOST=PRESENT", { flag: "wx" }),
      writeFile(paths.dns, "AVAILABLE", { flag: "wx" }),
      writeFile(paths.egress, "UNAVAILABLE", { flag: "wx" }),
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
      assert.match(text, /1048576 \+ 1|maxBytes \+ 1/);
      assert.match(text, /diagnose-error\.ts/);
      assert.match(text, /FLARESOLVERR_URL/);
      assert.match(text, /torrent-indexer\.darklyn\.org\//);
      assert.doesNotMatch(text, /\/search|\/indexers\/manual|\/ui/);
    }
  });

  it("builds the HTTP request with a constant printf format and literal percent encoding", async () => {
    const encodedQuery = "q=Big%20Buck%20Bunny&filter_results=true&limit=1";
    for (const script of ["contract-test.sh", "contract-test.ps1"]) {
      const text = await readFile(
        new URL(`../lab/torrent-indexer-runtime/scripts/${script}`, import.meta.url),
        "utf8",
      );
      assert.equal((text.match(/Big%20Buck%20Bunny/g) ?? []).length, 1);
      assert.equal((text.match(new RegExp(encodedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 1);
      const constantFormat = script.endsWith(".sh")
        ? "printf '%s\\\\r\\\\n%s\\\\r\\\\n%s\\\\r\\\\n\\\\r\\\\n'"
        : "printf '%s\\r\\n%s\\r\\n%s\\r\\n\\r\\n'";
      assert.equal(text.includes(constantFormat), true);
      assert.doesNotMatch(text, /printf 'GET \/indexers\//);
      assert.match(text, /HTTP\/1\.0' 'Host: 127\.0\.0\.1' 'Connection: close'/);
      assert.equal((text.match(/CONTRACT_QUERY_ONCE/g) ?? []).length, 1);
    }
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
