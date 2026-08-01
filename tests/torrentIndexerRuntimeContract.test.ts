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
  createRuntimeContractReport,
  parseRuntimeInteger,
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
      assert.match(text, /remove|Remove-Item/);
      assert.match(text, /limit=1/);
      assert.match(text, /20 \* 1000|timeout 20s/);
      assert.match(text, /1048576 \+ 1|maxBytes \+ 1/);
    }
  });

  it("uses idempotent POSIX signal cleanup and exits without resuming", async () => {
    const text = await readFile(
      new URL("../lab/torrent-indexer-runtime/scripts/contract-test.sh", import.meta.url),
      "utf8",
    );
    assert.match(text, /CLEANED_UP=0/);
    assert.match(text, /trap - EXIT INT TERM/);
    assert.match(text, /trap 'on_signal 130' INT/);
    assert.match(text, /trap 'on_signal 143' TERM/);
    assert.match(text, /on_signal\(\)[\s\S]*exit "\$SIGNAL_STATUS"/);
  });
});
