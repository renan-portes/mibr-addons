import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
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
import { createExperimentalAddonHttpServer } from "../src/runtime/experimental/experimentalAddonHttpServer.js";
import { getExperimentalAddonManifest } from "../src/runtime/experimental/experimentalAddonManifest.js";
import { getManifest } from "../src/addon/manifest.js";

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

async function localRequest(port: number, path: string, method = "GET"): Promise<{ status: number; contentType: string; body: string }> {
  return new Promise((resolve, reject) => {
    const call = request({ host: "127.0.0.1", port, path, method }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, contentType: String(response.headers["content-type"] ?? ""), body }));
    });
    call.once("error", reject);
    call.end();
  });
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

  it("defines a single-shot POSIX dry-run launcher with secret-safe cleanup", () => {
    const launcher = readFileSync(new URL("../lab/real-debrid-addon-runtime/scripts/dry-run.sh", import.meta.url), "utf8");
    assert.match(launcher, /set -eu/);
    assert.match(launcher, /umask 077/);
    assert.match(launcher, /REAL_DEBRID_ADDON_RUNTIME_ENABLED=false/);
    assert.match(launcher, /\[ ! -s "\$placeholder" \]/);
    assert.match(launcher, /docker compose -f "\$compose_file" config --format json/);
    assert.match(launcher, /docker compose -f "\$compose_file" run --rm --no-deps addon-runtime-lab/);
    assert.match(launcher, /docker compose -f "\$compose_file" down --remove-orphans/);
    assert.match(launcher, /trap on_int INT/);
    assert.match(launcher, /trap on_term TERM/);
    assert.match(launcher, /trap on_tstp TSTP/);
    assert.match(launcher, /cleanup_done=0/);
    assert.match(launcher, /\[ "\$cleanup_done" -eq 0 \] \|\| return 0/);
    assert.doesNotMatch(launcher, /REAL_DEBRID_TOKEN_FILE_HOST=.*echo|printenv|env$/m);
  });

  it("executes launcher cleanup once and preserves main status with fake Docker", () => {
    const root = mkdtempSync(join(tmpdir(), "mibr-addon-dry-run-"));
    const bin = join(root, "bin");
    const log = join(root, "calls.log");
    const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\sh.exe" : "sh";
    const work = join(root, "work");
    try {
      mkdirSync(bin, { recursive: true });
      const writeFake = (name: string, source: string) => {
        const executable = join(bin, name);
        writeFileSync(executable, source);
        chmodSync(executable, 0o700);
      };
      writeFake("docker", `#!/bin/sh\necho "docker $*" >> "$FAKE_LOG"\ncase "$*" in *" config "*) echo '{"services":{"addon-runtime-lab":{}}}' ;; *" run "*) exit "\${FAKE_RUN_STATUS:-0}" ;; *" down "*) exit "\${FAKE_DOWN_STATUS:-0}" ;; esac\n`);
      writeFake("mktemp", `#!/bin/sh\necho "mktemp $*" >> "$FAKE_LOG"\n/bin/mkdir -p "$FAKE_TEMP_DIR"\nprintf '%s\\n' "$FAKE_TEMP_DIR"\n`);
      writeFake("chmod", `#!/bin/sh\necho "chmod $*" >> "$FAKE_LOG"\n/bin/chmod "$@"\n`);
      writeFake("rm", `#!/bin/sh\necho "rm $*" >> "$FAKE_LOG"\n[ "\${FAKE_RM_STATUS:-0}" = 0 ] || exit "$FAKE_RM_STATUS"\n/bin/rm "$@"\n`);
      writeFake("rmdir", `#!/bin/sh\necho "rmdir $*" >> "$FAKE_LOG"\n/bin/rmdir "$@"\n`);
      for (const [runStatus, downStatus, rmStatus] of [["0", "0", "0"], ["17", "0", "0"], ["23", "9", "0"], ["29", "0", "7"]]) {
        rmSync(log, { force: true });
        rmSync(work, { recursive: true, force: true });
        const command = process.platform === "win32"
          ? 'export PATH="$(/usr/bin/cygpath -u "$TEST_BIN"):$PATH"; exec /bin/sh "$TEST_LAUNCHER"'
          : 'export PATH="$TEST_BIN:$PATH"; exec sh "$TEST_LAUNCHER"';
        const result = spawnSync(shell, ["-c", command], {
          cwd: process.cwd(), encoding: "utf8",
          env: { ...process.env, TEST_BIN: bin, TEST_LAUNCHER: "lab/real-debrid-addon-runtime/scripts/dry-run.sh", FAKE_LOG: log, FAKE_TEMP_DIR: work, FAKE_RUN_STATUS: runStatus, FAKE_DOWN_STATUS: downStatus, FAKE_RM_STATUS: rmStatus },
        });
        assert.equal(result.status, Number(runStatus));
        assert.equal(result.stdout.includes("real_debrid_token"), false);
        const calls = readFileSync(log, "utf8").trim().split("\n");
        const configIndex = calls.findIndex((call) => call.includes(" config "));
        const runIndex = calls.findIndex((call) => call.includes(" run "));
        const downIndex = calls.findIndex((call) => call.includes(" down "));
        assert.notEqual(configIndex, -1);
        assert.notEqual(runIndex, -1);
        assert.notEqual(downIndex, -1);
        assert.ok(configIndex < runIndex);
        assert.ok(runIndex < downIndex);
        assert.equal(calls.filter((call) => call.includes(" config ")).length, 1);
        assert.equal(calls.filter((call) => call.includes(" run ")).length, 1);
        assert.equal(calls.filter((call) => call.includes(" down ")).length, 1);
        assert.equal(calls.filter((call) => call.startsWith("mktemp ")).length, 1);
        assert.equal(calls.filter((call) => call.startsWith("chmod ")).length, 1);
        assert.equal(calls.filter((call) => call.startsWith("rm ")).length, 1);
        assert.equal(calls.filter((call) => call.startsWith("rmdir ")).length, 1);
        if (rmStatus === "0") assert.equal(existsSync(work), false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("serves only the isolated offline experimental HTTP surface", async () => {
    const runtime = createExperimentalRealDebridAddonRuntime(config(false), { client: new StaticClient(), parser });
    const server = createExperimentalAddonHttpServer({ runtime });
    await once(server, "listening");
    const address = server.address();
    assert.equal(typeof address === "object" && address !== null, true);
    const port = (address as { port: number }).port;
    try {
      const health = await localRequest(port, "/health");
      const manifest = await localRequest(port, "/manifest.json");
      const stream = await localRequest(port, "/stream/movie/tt0000001.json");
      const unknown = await localRequest(port, "/debug");
      const method = await localRequest(port, "/health", "POST");
      assert.equal(health.status, 200);
      assert.equal(manifest.status, 200);
      assert.equal(stream.status, 200);
      assert.deepEqual(JSON.parse(stream.body), { streams: [] });
      assert.equal(unknown.status, 404);
      assert.equal(method.status, 405);
      assert.match(manifest.contentType, /^application\/json/);
      assert.notDeepEqual(JSON.parse(manifest.body), getManifest());
      const copied = getExperimentalAddonManifest();
      copied.name = "mutated";
      assert.notEqual(getExperimentalAddonManifest().name, "mutated");
      assert.equal(JSON.stringify([health, manifest, stream, unknown, method]).includes(TOKEN), false);
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("defines a bounded, loopback-only experimental HTTP launcher", () => {
    const launcher = readFileSync(new URL("../lab/real-debrid-addon-runtime/scripts/http-offline.sh", import.meta.url), "utf8");
    assert.match(launcher, /set -eu/);
    assert.match(launcher, /umask 077/);
    assert.match(launcher, /127\.0\.0\.1:\$\{port\}:7007/);
    assert.match(launcher, /\[ "\$attempt" -lt 5 \]/);
    assert.match(launcher, /--max-redirs 0/);
    assert.match(launcher, /addon-runtime-http-lab/);
    assert.match(launcher, /down --remove-orphans/);
    assert.match(launcher, /trap .*INT/);
    assert.match(launcher, /trap .*TERM/);
    assert.match(launcher, /trap .*TSTP/);
    assert.match(launcher, /cleanup\(\)/);
    assert.match(launcher, /\[ "\$cleaned" -eq 0 \] \|\| return 0/);
    assert.doesNotMatch(launcher, /0\.0\.0\.0|REAL_DEBRID_TOKEN=/);
  });

  it("executes the HTTP launcher with only local fake commands across bounded failures", () => {
    const root = mkdtempSync(join(tmpdir(), "mibr-http-launcher-"));
    const bin = join(root, "bin");
    const log = join(root, "calls.log");
    const work = join(root, "work");
    const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\sh.exe" : "sh";
    try {
      mkdirSync(bin, { recursive: true });
      const fake = (name: string, source: string) => { const path = join(bin, name); writeFileSync(path, source); chmodSync(path, 0o700); };
      fake("docker", `#!/bin/sh\necho "docker $*" >> "$FAKE_LOG"\ncase "$*" in *" up "*) exit "\${FAKE_UP_STATUS:-0}";; *" down "*) exit "\${FAKE_DOWN_STATUS:-0}";; esac\n`);
      fake("mktemp", `#!/bin/sh\necho mktemp >> "$FAKE_LOG"\n/bin/mkdir -p "$FAKE_TEMP_DIR"\nprintf '%s\\n' "$FAKE_TEMP_DIR"\n`);
      fake("chmod", `#!/bin/sh\n/bin/chmod "$@"\n`);
      fake("chown", `#!/bin/sh\necho chown >> "$FAKE_LOG"\n`);
      fake("stat", `#!/bin/sh\necho "stat $*" >> "$FAKE_LOG"\ncase "$*" in *%a*) case "$*" in *compose.override.yml*) echo 600;; *) echo 400;; esac;; *%u*|*%g*) echo 1000;; *%s*) echo 0;; *%F*) echo 'regular file';; *) exit 1;; esac\n`);
      fake("rm", `#!/bin/sh\necho rm >> "$FAKE_LOG"\n[ "\${FAKE_RM_STATUS:-0}" = 0 ] || exit "$FAKE_RM_STATUS"\n/bin/rm "$@"\n`);
      fake("rmdir", `#!/bin/sh\necho rmdir >> "$FAKE_LOG"\n[ "\${FAKE_RMDIR_STATUS:-0}" = 0 ] || exit "$FAKE_RMDIR_STATUS"\n/bin/rmdir "$@"\n`);
      fake("sleep", `#!/bin/sh\necho sleep >> "$FAKE_LOG"\n`);
      fake("curl", `#!/bin/sh\nheaders= body= url=\nwhile [ "$#" -gt 0 ]; do case "$1" in -D) headers=$2; shift 2;; -o) body=$2; shift 2;; *) url=$1; shift;; esac; done\necho "curl $url" >> "$FAKE_LOG"\ncase "$url" in */health) n=$(cat "$FAKE_COUNT" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$FAKE_COUNT"; [ "$n" -le "\${FAKE_HEALTH_FAILS:-0}" ] && exit 28; mode=health; setting="\${FAKE_health_MODE:-ok}";; */manifest.json) mode=manifest; setting="\${FAKE_manifest_MODE:-ok}";; *) mode=stream; setting="\${FAKE_stream_MODE:-ok}";; esac\ncase "$mode" in health) payload='{"status":"ok"}';; manifest) payload='{"id":"experimental","name":"experimental","resources":["stream"]}';; stream) payload='{"streams":[]}';; esac\ncase "$setting" in invalid) payload='{' ;; http|redirect) code=500 ;; *) code=200;; esac\nprintf 'HTTP/1.1 %s OK\\r\\nContent-Type: application/json\\r\\n\\r\\n' "$code" > "$headers"\nprintf '%s' "$payload" > "$body"\nprintf '%s' "$code"\n`);
      const cases = [
        ["success", "0", "0", "1", "ok", "ok"], ["up", "17", "0", "0", "ok", "ok"], ["health-timeout", "0", "5", "5", "ok", "ok"],
        ["health-last", "0", "4", "5", "ok", "ok"], ["health-redirect", "0", "0", "5", "ok", "ok"], ["manifest-invalid", "0", "0", "1", "invalid", "ok"], ["stream-invalid", "0", "0", "1", "ok", "invalid"],
        ["manifest-http", "0", "0", "1", "http", "ok"], ["stream-http", "0", "0", "1", "ok", "http"], ["manifest-redirect", "0", "0", "1", "redirect", "ok"], ["stream-redirect", "0", "0", "1", "ok", "redirect"],
      ] as const;
      for (const [name, up, healthFails, expectedHealth, manifestMode, streamMode] of cases) {
        rmSync(log, { force: true }); rmSync(work, { recursive: true, force: true }); rmSync(join(root, "count"), { force: true });
        const command = process.platform === "win32" ? 'export PATH="$(/usr/bin/cygpath -u "$TEST_BIN"):$PATH"; exec /bin/sh "$TEST_LAUNCHER"' : 'export PATH="$TEST_BIN:$PATH"; exec sh "$TEST_LAUNCHER"';
        const result = spawnSync(shell, ["-c", command], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, TEST_BIN: bin, TEST_LAUNCHER: "lab/real-debrid-addon-runtime/scripts/http-offline.sh", FAKE_LOG: log, FAKE_TEMP_DIR: work, FAKE_COUNT: join(root, "count"), FAKE_UP_STATUS: up, FAKE_HEALTH_FAILS: healthFails, FAKE_health_MODE: name === "health-redirect" ? "redirect" : "ok", FAKE_manifest_MODE: manifestMode, FAKE_stream_MODE: streamMode, FAKE_DOWN_STATUS: name === "success" ? "9" : "0", FAKE_RM_STATUS: "0", FAKE_RMDIR_STATUS: "0" } });
        assert.equal(result.status, name === "up" ? 17 : name === "success" || name === "health-last" ? 0 : 1);
        const calls = readFileSync(log, "utf8").trim().split("\n");
        assert.equal(calls.filter((x) => x.includes(" down ")).length, 1);
        assert.equal(calls.filter((x) => x.includes(" up ")).length, 1);
        const configIndex = calls.findIndex((x) => x.includes(" config "));
        if (configIndex !== -1) assert.ok(calls.indexOf("chown") < configIndex);
        assert.equal(calls.filter((x) => x.includes("/health")).length, Number(expectedHealth));
        assert.equal(calls.filter((x) => x.includes("/manifest.json")).length, name === "up" || name === "health-timeout" || name === "health-redirect" ? 0 : 1);
        assert.equal(calls.filter((x) => x.includes("tt0000001")).length, name === "success" || name === "health-last" || name === "stream-invalid" || name === "stream-http" || name === "stream-redirect" ? 1 : 0);
        assert.equal(result.stdout.includes("127.0.0.1"), false);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
