import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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
});
