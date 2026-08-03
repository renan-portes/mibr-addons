import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { sanitizeAccountPayload } from "../lab/real-debrid-runtime/tools/runtime-test.js";
import { buildFailureReport, CandidateStageTracker, RuntimeLifecycleExit, RuntimeValidationError, runOfflineLifecycle, validatePosixMode, validateRuntimeConfiguration } from "../lab/real-debrid-runtime/tools/runtime-lab-support.js";

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
    assert.match(dockerfile, /npm ci --ignore-scripts/);
    assert.match(dockerfile, /USER node/);
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
    assert.match(powershell, /GetTempPath[\s\S]*Remove-Item -LiteralPath \$tempDir/);
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
