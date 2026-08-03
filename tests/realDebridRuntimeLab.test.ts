import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadRuntimeToken, sanitizeAccountPayload, type RuntimeTokenFileAccess } from "../lab/real-debrid-runtime/tools/runtime-test.js";
import { buildFailureReport, CandidateDiagnosticTracker, CandidatePollingDiagnosticTracker, candidateRuntimeCategory, CandidateStageTracker, opaqueCategory, RuntimeLifecycleExit, RuntimeValidationError, runOfflineLifecycle, validatePosixMode, validateRuntimeConfiguration, validateRuntimeSecretMetadata, type RuntimeSecretMetadata } from "../lab/real-debrid-runtime/tools/runtime-lab-support.js";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const compose = read("lab/real-debrid-runtime/compose.yml");
const posix = read("lab/real-debrid-runtime/scripts/runtime-test.sh");
const powershell = read("lab/real-debrid-runtime/scripts/runtime-test.ps1");
const tool = read("lab/real-debrid-runtime/tools/runtime-test.ts");

describe("Real-Debrid authenticated runtime laboratory", () => {
  it("keeps the real environment ignored and the example empty", () => {
    assert.equal(read("lab/real-debrid-runtime/.env.example"), "REAL_DEBRID_AUTHORIZED=false\nREAL_DEBRID_API_TOKEN=\nREAL_DEBRID_TEST_MODE=account\n");
    const ignored = execFileSync("git", ["check-ignore", "lab/real-debrid-runtime/.env"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    assert.match(ignored, /lab\/real-debrid-runtime\/\.env/);
  });

  it("requires explicit authorization and a non-empty token without putting it in commands", () => {
    for (const script of [posix, powershell]) {
      assert.match(script, /REAL_DEBRID_AUTHORIZED=true/);
      assert.match(script, /API token is missing/);
      assert.doesNotMatch(script, /docker[^\n]*(?:API_TOKEN|tokenLine)/i);
    }
    assert.match(posix, /\*00\)/);
    assert.match(powershell, /WindowsIdentity[\s\S]*Get-Acl[\s\S]*ACL must be restricted/);
    assert.doesNotMatch(compose, /command:[^\n]*(?:API_TOKEN|Bearer)/i);
  });

  it("keeps the token outside versioned Compose, rendered environment and temporary override values", () => {
    const renderEnvironment = { REAL_DEBRID_API_TOKEN: "must-not-render", REAL_DEBRID_AUTHORIZED: "true", REAL_DEBRID_TEST_MODE: "account" } as const;
    const rendered = compose.replace(/\$\{([A-Z0-9_]+):-([^}]*)\}/g, (_match, name: keyof typeof renderEnvironment, fallback: string) => renderEnvironment[name] ?? fallback);
    assert.doesNotMatch(compose, /REAL_DEBRID_API_TOKEN|Bearer|secret-value/);
    assert.doesNotMatch(rendered, /REAL_DEBRID_API_TOKEN|must-not-render/);
    assert.match(compose, /REAL_DEBRID_TOKEN_FILE:\s*\/run\/secrets\/real_debrid_token/);
    assert.match(posix, /source: '\$SECRET_FILE'[\s\S]*target: \/run\/secrets\/real_debrid_token/);
    assert.match(powershell, /source: '\$yamlPath'[\s\S]*target: \/run\/secrets\/real_debrid_token/);
    assert.doesNotMatch(`${posix}\n${powershell}`, /docker compose[^\n]*(?:\$TOKEN|\$token\b|tokenLine)/);
  });

  it("executes pure configuration and permissions validators", () => {
    const base = { REAL_DEBRID_AUTHORIZED: "true", REAL_DEBRID_API_TOKEN: "opaque-synthetic", REAL_DEBRID_TEST_MODE: "account", REAL_DEBRID_CANDIDATE_AUTHORIZED: "true", REAL_DEBRID_CANDIDATE_MAGNET: "ignored", REAL_DEBRID_CANDIDATE_INFO_HASH: "ignored", REAL_DEBRID_CANDIDATE_FILE_PATH: "ignored", REAL_DEBRID_CANDIDATE_FILE_BYTES: "ignored" };
    assert.throws(() => validateRuntimeConfiguration(base, false), (error: unknown) => error instanceof RuntimeValidationError && error.code === "ENV_MISSING");
    assert.throws(() => validateRuntimeConfiguration({ ...base, REAL_DEBRID_AUTHORIZED: "false" }), (error: unknown) => error instanceof RuntimeValidationError && error.code === "NOT_AUTHORIZED");
    for (const token of ["", "   ", "x".repeat(4097)]) assert.throws(() => validateRuntimeConfiguration({ ...base, REAL_DEBRID_API_TOKEN: token }), (error: unknown) => error instanceof RuntimeValidationError && error.code === "TOKEN_INVALID");
    assert.throws(() => validateRuntimeConfiguration({ ...base, REAL_DEBRID_TEST_MODE: "unknown" }), (error: unknown) => error instanceof RuntimeValidationError && error.code === "MODE_INVALID");
    assert.throws(() => validateRuntimeConfiguration({ ...base, REAL_DEBRID_TEST_MODE: "candidate", REAL_DEBRID_CANDIDATE_AUTHORIZED: "false" }), (error: unknown) => error instanceof RuntimeValidationError && error.code === "CANDIDATE_NOT_AUTHORIZED");
    const validCandidate = { ...base, REAL_DEBRID_TEST_MODE: "candidate", REAL_DEBRID_CANDIDATE_MAGNET: "synthetic", REAL_DEBRID_CANDIDATE_INFO_HASH: "a".repeat(40), REAL_DEBRID_CANDIDATE_FILE_PATH: "authorized.mkv", REAL_DEBRID_CANDIDATE_FILE_BYTES: "1" };
    for (const name of ["REAL_DEBRID_CANDIDATE_MAGNET", "REAL_DEBRID_CANDIDATE_INFO_HASH", "REAL_DEBRID_CANDIDATE_FILE_PATH", "REAL_DEBRID_CANDIDATE_FILE_BYTES"] as const) {
      assert.throws(() => validateRuntimeConfiguration({ ...validCandidate, [name]: "" }), (error: unknown) => error instanceof RuntimeValidationError && error.code === "CANDIDATE_INPUT_INVALID");
    }
    assert.deepEqual(validateRuntimeConfiguration(base), { mode: "account", token: "opaque-synthetic" });
    validatePosixMode(0o600);
    for (const mode of [undefined, 0o640, 0o604, 0o666]) assert.throws(() => validatePosixMode(mode), (error: unknown) => error instanceof RuntimeValidationError && error.code === "PERMISSIONS_UNSAFE");
  });

  it("accepts only a traversable 1000:1000 directory and a private regular secret", () => {
    const metadata = (overrides: Partial<RuntimeSecretMetadata> = {}): RuntimeSecretMetadata => ({ kind: "file", uid: 1_000, gid: 1_000, mode: 0o400, size: 1, readable: true, ...overrides });
    const directory = metadata({ kind: "directory", mode: 0o700, size: 0 });
    validateRuntimeSecretMetadata(directory, metadata());
    validateRuntimeSecretMetadata(directory, metadata({ mode: 0o600 }));
    for (const invalid of [
      [metadata({ kind: "directory", uid: 0, gid: 0, mode: 0o700, size: 0 }), metadata()],
      [directory, metadata({ uid: 0, gid: 0, mode: 0o600 })],
      [directory, metadata({ uid: 1_001 })],
      [directory, metadata({ gid: 1_001 })],
      [directory, metadata({ mode: 0o644 })],
      [directory, metadata({ kind: "other" })],
    ] as const) assert.throws(() => validateRuntimeSecretMetadata(invalid[0], invalid[1]), (error: unknown) => error instanceof RuntimeValidationError && error.code === "TOKEN_FILE_INVALID_PERMISSIONS");
    assert.throws(() => validateRuntimeSecretMetadata(directory, metadata({ kind: "missing" })), (error: unknown) => error instanceof RuntimeValidationError && error.code === "TOKEN_FILE_MISSING");
    assert.throws(() => validateRuntimeSecretMetadata(directory, metadata({ size: 0 })), (error: unknown) => error instanceof RuntimeValidationError && error.code === "TOKEN_FILE_EMPTY");
    assert.throws(() => validateRuntimeSecretMetadata(directory, metadata({ readable: false })), (error: unknown) => error instanceof RuntimeValidationError && error.code === "TOKEN_FILE_UNREADABLE");
  });

  it("classifies token-file failures before any transport can start", async () => {
    const access = (overrides: Partial<Awaited<ReturnType<RuntimeTokenFileAccess["lstat"]>>> = {}, token = "synthetic-token"): RuntimeTokenFileAccess => ({
      lstat: async () => ({ isFile: () => true, size: token.length, mode: 0o100400, uid: 1_000, gid: 1_000, ...overrides }),
      access: async () => {}, readFile: async () => token,
    });
    let transportCalls = 0;
    const run = async (path: string | undefined, fileAccess: RuntimeTokenFileAccess): Promise<void> => { await loadRuntimeToken(path, fileAccess); transportCalls += 1; };
    await assert.rejects(run(undefined, access()), (error: unknown) => error instanceof RuntimeValidationError && error.code === "INVALID_CONFIGURATION");
    await assert.rejects(run("secret", { ...access(), lstat: async () => { throw Object.assign(new Error("opaque"), { code: "ENOENT" }); } }), (error: unknown) => error instanceof RuntimeValidationError && error.code === "TOKEN_FILE_MISSING");
    await assert.rejects(run("secret", access({ size: 0 }, "")), (error: unknown) => error instanceof RuntimeValidationError && error.code === "TOKEN_FILE_EMPTY");
    await assert.rejects(run("secret", access({ isFile: () => false })), (error: unknown) => error instanceof RuntimeValidationError && error.code === "TOKEN_FILE_INVALID_PERMISSIONS");
    await assert.rejects(run("secret", { ...access(), access: async () => { throw new Error("opaque"); } }), (error: unknown) => error instanceof RuntimeValidationError && error.code === "TOKEN_FILE_UNREADABLE");
    await assert.rejects(run("secret", access({}, "line1\nline2")), (error: unknown) => error instanceof RuntimeValidationError && error.code === "INVALID_CONFIGURATION");
    assert.equal(transportCalls, 0);
    for (const category of ["TOKEN_FILE_MISSING", "TOKEN_FILE_UNREADABLE", "TOKEN_FILE_EMPTY", "TOKEN_FILE_INVALID_PERMISSIONS", "INVALID_CONFIGURATION"]) {
      const report = buildFailureReport("account", category, 0);
      assert.equal(report.category, category); assert.equal(report.HTTP, 0); assert.equal(report.durationMs, 0);
      assert.doesNotMatch(JSON.stringify(report), /synthetic-token|\/run\/secrets|real_debrid_token|pathname/i);
    }
  });

  it("defines a disposable hardened service without published ports or persistent storage", () => {
    assert.match(compose, /read_only:\s*true/);
    assert.match(compose, /user:\s*"1000:1000"/);
    assert.match(compose, /cap_drop:\s*\n\s*- ALL/);
    assert.match(compose, /no-new-privileges:true/);
    assert.match(compose, /privileged:\s*false/);
    assert.match(compose, /pids_limit:\s*64/);
    assert.match(compose, /mem_limit:\s*256m/);
    assert.match(compose, /cpus:\s*0\.50/);
    assert.match(compose, /\.\.\/\.\.:\/workspace:ro/);
    assert.match(compose, /tmpfs:/);
    assert.doesNotMatch(compose, /ports:|network_mode:\s*host|docker\.sock/);
    assert.doesNotMatch(compose, /^volumes:/m);
  });

  it("builds a pinned non-root tools image from the lockfile without scripts", () => {
    const dockerfile = read("lab/real-debrid-runtime/Dockerfile.tools");
    assert.match(dockerfile, /^FROM node:24\.4\.1-bookworm-slim/m);
    assert.match(dockerfile, /WORKDIR \/opt\/runtime-tools\s+RUN chown node:node \/opt\/runtime-tools/);
    assert.match(dockerfile, /RUN chown node:node \/opt\/runtime-tools[\s\S]*USER node[\s\S]*RUN npm ci --ignore-scripts/);
    assert.ok(dockerfile.indexOf("USER node") < dockerfile.indexOf("RUN npm ci --ignore-scripts"));
    assert.doesNotMatch(dockerfile.slice(0, dockerfile.indexOf("USER node")), /RUN npm ci/);
    assert.doesNotMatch(dockerfile, /ARG.*TOKEN|ENV.*TOKEN|\.env/);
  });

  it("runs account exactly once and never touches candidate endpoints in account flow", () => {
    assert.equal((tool.match(/ACCOUNT_REQUEST_ONCE/g) ?? []).length, 1);
    assert.equal((tool.match(/pathname: "\/user"/g) ?? []).length, 1);
    const accountSection = tool.slice(tool.indexOf("async function account"), tool.indexOf("async function candidate"));
    assert.doesNotMatch(accountSection, /addMagnet|selectFile|unrestrict|\/torrents\//);
    assert.doesNotMatch(accountSection, /for\s*\(|while\s*\(/i);
  });

  it("sanitizes account payloads by allowlist without personal data or raw payload", () => {
    const secret = "synthetic-sensitive-value";
    const report = sanitizeAccountPayload({ type: "premium", expiration: "future", premium: 1, username: secret, email: secret, id: secret, avatar: secret, points: 999, token: secret, Authorization: secret, payload: { secret } }, 200, 12);
    assert.deepEqual(report, { authenticated: "SIM", accountType: "premium", expirationPresent: "SIM", premiumPresent: "SIM", HTTP: 200, durationMs: 12, category: "SUCCESS" });
    assert.equal(JSON.stringify(report).includes(secret), false);
    for (const forbidden of ["username", "email", "token", "Authorization", "avatar", "points", "id", "payload"]) assert.equal(Object.hasOwn(report, forbidden), false);
  });

  it("sanitizes arbitrary account and candidate failure material with opaque categories", () => {
    const sensitive = ["secret-token", "Authorization: Bearer secret-token", "person@example.invalid", "username-value", "account-id-value", "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567", "0123456789abcdef0123456789abcdef01234567", "https://media.example.invalid/file.mkv", "file-name.mkv", '{"payload":"raw"}'];
    for (const value of sensitive) {
      const accountReport = buildFailureReport("account", value, 5);
      const candidateReport = buildFailureReport("candidate", value, 5);
      assert.equal(JSON.stringify(accountReport).includes(value), false);
      assert.equal(JSON.stringify(candidateReport).includes(value), false);
      assert.equal(accountReport.category, "UNKNOWN"); assert.equal(candidateReport.category, "UNKNOWN");
    }
    assert.equal(buildFailureReport("account", "invalid_json", 1).category, "INVALID_JSON");
  });

  it("keeps candidate mode separately authorized and refuses missing temporary input", () => {
    for (const script of [posix, powershell]) {
      assert.match(script, /REAL_DEBRID_CANDIDATE_AUTHORIZED/);
      assert.match(script, /Candidate mode requires temporary authorized input|candidate mode requires temporary authorized input/i);
    }
    assert.match(tool, /CANDIDATE_RESOLUTION_ONCE/);
    assert.match(tool, /REAL_DEBRID_CANDIDATE_MAGNET/);
    assert.doesNotMatch(read("lab/real-debrid-runtime/.env.example"), /CANDIDATE_|magnet:|info.hash/i);
  });

  it("emits only sanitized candidate metadata and never sensitive values", () => {
    const candidateEmit = tool.slice(tool.indexOf("async function candidate"), tool.indexOf("async function main"));
    assert.match(candidateEmit, /finalUrlValid/);
    assert.match(candidateEmit, /stagesCompleted/);
    assert.doesNotMatch(candidateEmit, /emit\([^\n]*(?:magnet|infoHash|path|result\.url)/);
  });

  it("classifies post-add failures and emits only allowlisted structural diagnostics", () => {
    const categories = ["INFO_HTTP_ERROR", "INFO_INVALID_JSON", "INFO_INVALID_RESPONSE", "UNKNOWN_TORRENT_STATUS", "TERMINAL_TORRENT_STATUS", "FILE_LIST_MISSING", "FILE_LIST_INVALID", "AUTHORIZED_FILE_NOT_FOUND", "AUTHORIZED_FILE_SIZE_MISMATCH", "AMBIGUOUS_AUTHORIZED_FILE", "FILE_ID_INVALID", "GLOBAL_TIMEOUT", "POLLING_EXHAUSTED", "POLLING_DELAY_TIMEOUT", "INFO_REQUEST_TIMEOUT", "TIMEOUT", "CANCELED", "UNKNOWN"];
    for (const value of categories) assert.equal(opaqueCategory(value), value);
    const mappings: Array<[string | undefined, "info" | "workflow", string]> = [
      ["unexpected_http_status", "info", "INFO_HTTP_ERROR"], ["rate_limited", "info", "INFO_HTTP_ERROR"],
      ["invalid_json", "info", "INFO_INVALID_JSON"], ["invalid_response", "info", "INFO_INVALID_RESPONSE"],
      ["unknown_status", "info", "UNKNOWN_TORRENT_STATUS"], ["terminal_status", "workflow", "TERMINAL_TORRENT_STATUS"],
      ["file_list_missing", "info", "FILE_LIST_MISSING"], ["file_list_invalid", "info", "FILE_LIST_INVALID"],
      ["file_list_too_many", "info", "FILE_LIST_INVALID"], ["file_id_invalid", "info", "FILE_ID_INVALID"],
      ["authorized_file_not_found", "workflow", "AUTHORIZED_FILE_NOT_FOUND"],
      ["authorized_file_size_mismatch", "workflow", "AUTHORIZED_FILE_SIZE_MISMATCH"],
      ["ambiguous_authorized_file", "workflow", "AMBIGUOUS_AUTHORIZED_FILE"],
      ["global_timeout", "workflow", "GLOBAL_TIMEOUT"], ["polling_exhausted", "workflow", "POLLING_EXHAUSTED"],
      ["polling_delay_timeout", "workflow", "POLLING_DELAY_TIMEOUT"], ["info_request_timeout", "workflow", "INFO_REQUEST_TIMEOUT"],
      ["timeout", "workflow", "TIMEOUT"], ["canceled", "workflow", "CANCELED"], [undefined, "workflow", "UNKNOWN"],
    ];
    for (const [code, phase, expected] of mappings) assert.equal(candidateRuntimeCategory(code, phase), expected);
    const tracker = new CandidateDiagnosticTracker();
    tracker.recordInfo({ files: [{ id: 7, path: "root/authorized.mkv", bytes: 10 }] }, "root/authorized.mkv", 10);
    assert.deepEqual(tracker.snapshot(), { infoRequestCompleted: "SIM", statusRecognized: "SIM", fileArrayPresent: "SIM", fileCountBucket: "ONE", authorizedFileMatched: "SIM", authorizedFileSizeMatched: "SIM", selectedFileIdValid: "SIM" });
    const tooMany = new CandidateDiagnosticTracker(); tooMany.recordError("file_list_too_many");
    assert.equal(tooMany.snapshot().fileCountBucket, "TOO_MANY");
    const zero = new CandidateDiagnosticTracker(); zero.recordInfo({ files: [] }, "authorized.mkv", 10);
    assert.equal(zero.snapshot().fileCountBucket, "ZERO");
    const multiple = new CandidateDiagnosticTracker(); multiple.recordInfo({ files: [{ id: 1, path: "one.mkv", bytes: 1 }, { id: 2, path: "two.mkv", bytes: 2 }] }, "authorized.mkv", 10);
    assert.deepEqual({ bucket: multiple.snapshot().fileCountBucket, path: multiple.snapshot().authorizedFileMatched, size: multiple.snapshot().authorizedFileSizeMatched }, { bucket: "MULTIPLE", path: "NÃO", size: "NÃO" });
    const incomplete = new CandidateDiagnosticTracker(); incomplete.recordError("transport_error");
    assert.equal(incomplete.snapshot().infoRequestCompleted, "NÃO");
    const serialized = JSON.stringify(tracker.snapshot());
    for (const forbidden of ["root/authorized.mkv", "magnet:?", "torrent-1", "https://", "bytes", "path"]) assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false);
    assert.match(tool, /diagnostics\.snapshot\(\)/);
    const polling = new CandidatePollingDiagnosticTracker();
    polling.startAttempt(); polling.recordStatus("queued"); polling.startAttempt(); polling.recordStatus("compressing"); polling.recordFailure("polling_exhausted");
    assert.deepEqual(polling.snapshot(), { pollingStarted: "SIM", pollingAttemptsBucket: "FEW", lastStatusCategory: "COMPRESSING", globalDeadlineReached: "NÃO", pollingLimitReached: "SIM" });
    const global = new CandidatePollingDiagnosticTracker(); global.startAttempt(); global.recordStatus("downloading"); global.recordFailure("global_timeout");
    assert.deepEqual(global.snapshot(), { pollingStarted: "SIM", pollingAttemptsBucket: "ONE", lastStatusCategory: "DOWNLOADING", globalDeadlineReached: "SIM", pollingLimitReached: "NÃO" });
    assert.match(tool, /pollAttempts: 10/); assert.match(tool, /totalTimeoutMs: 30_000/); assert.match(tool, /setTimeout\(finish, 1_500\)/);
    for (const forbidden of ["torrentId", "magnet", "infoHash", "path", "link", "url"]) assert.equal(JSON.stringify(polling.snapshot()).includes(forbidden), false);
  });

  it("preserves one invocation, no retry, global timeout, cleanup and exit codes", () => {
    assert.equal((posix.match(/RUNTIME_INVOCATION_ONCE/g) ?? []).length, 1);
    assert.equal((powershell.match(/RUNTIME_INVOCATION_ONCE/g) ?? []).length, 1);
    assert.match(posix, /timeout --signal=TERM --kill-after=5s 60s/);
    assert.match(posix, /RUNTIME_PID=\$![\s\S]*wait "\$RUNTIME_PID"/);
    assert.match(posix, /kill -TERM "-\$RUNTIME_PID"[\s\S]*kill -KILL "-\$RUNTIME_PID"/);
    assert.match(powershell, /WaitForExit\(60000\)/);
    assert.match(posix, /trap cleanup EXIT/);
    assert.match(posix, /trap 'on_signal 130' INT/);
    assert.match(posix, /trap 'on_signal 143' TERM/);
    assert.match(posix, /trap 'on_signal 148' TSTP/);
    assert.match(powershell, /add_CancelKeyPress[\s\S]*Stop-RuntimeTree/);
    assert.match(powershell, /taskkill \/PID \$script:runtimeProcess\.Id \/T \/F/);
    assert.match(powershell, /finally[\s\S]*Stop-RuntimeTree[\s\S]*Invoke-ComposeCleanup/);
    assert.match(posix, /RUNTIME_TEMP_DIR=\$\(mktemp -d\)[\s\S]*rmdir "\$RUNTIME_TEMP_DIR"/);
    assert.match(posix, /umask 077[\s\S]*mktemp -d[\s\S]*printf '%s' "\$TOKEN"[\s\S]*chown 1000:1000 "\$RUNTIME_TEMP_DIR" "\$SECRET_FILE"[\s\S]*chmod 700 "\$RUNTIME_TEMP_DIR"[\s\S]*chmod 400 "\$SECRET_FILE"/);
    assert.match(posix, /stat -c '%u:%g:%a'[\s\S]*1000:1000:700[\s\S]*1000:1000:400/);
    assert.match(powershell, /GetTempPath[\s\S]*Remove-Item -LiteralPath \$tempDir/);
    assert.match(powershell, /pending validation of UID 1000 bind-mount ownership/);
    assert.doesNotMatch(`${posix}\n${powershell}`, /\bretry\b|for\s*\(.*docker|while\s*\(.*docker/i);
    assert.match(tool, /type ExitCode = 0 \| 1 \| 2/);
    assert.match(tool, /return result === null \? 2 : 0/);
  });

  it("executes cleanup exactly once and preserves success, partial, failure, timeout and signal codes", async () => {
    for (const expected of [0, 1, 2] as const) {
      let cleanups = 0; const code = await runOfflineLifecycle(async () => expected, async () => { cleanups += 1; });
      assert.equal(code, expected); assert.equal(cleanups, 1);
    }
    for (const expected of [130, 143, 148] as const) {
      let cleanups = 0; const code = await runOfflineLifecycle(async () => { throw new RuntimeLifecycleExit(expected); }, async () => { cleanups += 1; });
      assert.equal(code, expected); assert.equal(cleanups, 1);
    }
    assert.equal(await runOfflineLifecycle(async () => 0, async () => { throw new Error("cleanup failure"); }), 0);
    assert.equal(await runOfflineLifecycle(async () => { throw new Error("operation failure"); }, async () => {}), 1);
    const resources = new Set(["container", "network", "temporary-secret", "temporary-override"]); let fakeCleanupCalls = 0;
    const timeoutCode = await runOfflineLifecycle(async () => { throw new RuntimeLifecycleExit(143); }, async () => { fakeCleanupCalls += 1; resources.clear(); });
    assert.equal(timeoutCode, 143); assert.equal(fakeCleanupCalls, 1); assert.deepEqual([...resources], []);
  });

  it("records only actually completed candidate stages", () => {
    const beforeAdd = new CandidateStageTracker(); assert.deepEqual(beforeAdd.snapshot(), []);
    const afterAdd = new CandidateStageTracker(); afterAdd.complete("authenticated"); afterAdd.complete("magnet_added"); assert.deepEqual(afterAdd.snapshot(), ["authenticated", "magnet_added"]);
    const afterSelection = new CandidateStageTracker(); for (const stage of ["authenticated", "magnet_added", "file_selected"] as const) afterSelection.complete(stage); assert.deepEqual(afterSelection.snapshot(), ["authenticated", "magnet_added", "file_selected"]);
    const success = new CandidateStageTracker(); for (const stage of ["authenticated", "magnet_added", "file_selected", "downloaded", "link_unrestricted", "cleanup_attempted", "cleanup_completed", "final_url_validated"] as const) success.complete(stage); assert.equal(success.snapshot().includes("final_url_validated"), true);
    const cleanupFailure = new CandidateStageTracker(); cleanupFailure.complete("cleanup_attempted"); assert.deepEqual(cleanupFailure.snapshot(), ["cleanup_attempted"]);
    const canceled = new CandidateStageTracker(); canceled.complete("authenticated"); assert.deepEqual(canceled.snapshot(), ["authenticated"]);
  });

  it("does not create raw payload files inside the working tree", () => {
    const all = `${compose}\n${posix}\n${powershell}\n${tool}`;
    assert.doesNotMatch(all, /(?:payload|response)\.(?:json|raw)|Join-Path \$labRoot[^\n]*(?:token|payload|response)/i);
    assert.match(powershell, /WriteAllText\(\$secretFile[\s\S]*WriteAllText\(\$overrideFile/);
    assert.match(posix, /printf '%s' "\$TOKEN" >"\$SECRET_FILE"/);
    assert.doesNotMatch(all, /console\.(?:log|error)|Authorization.*process\.stdout/);
  });
});
