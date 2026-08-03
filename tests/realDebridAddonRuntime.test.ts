import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { Agent, request } from "node:http";
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

async function localRequest(port: number, path: string, method = "GET", agent?: Agent): Promise<{ status: number; contentType: string; contentLength: string; body: string }> {
  return new Promise((resolve, reject) => {
    const call = request({ host: "127.0.0.1", port, path, method, agent }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, contentType: String(response.headers["content-type"] ?? ""), contentLength: String(response.headers["content-length"] ?? ""), body }));
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
      const head = await localRequest(port, "/health", "HEAD");
      assert.equal(health.status, 200);
      assert.equal(health.contentLength, String(Buffer.byteLength(health.body)));
      assert.equal(manifest.status, 200);
      assert.equal(stream.status, 200);
      assert.deepEqual(JSON.parse(stream.body), { streams: [] });
      assert.equal(unknown.status, 404);
      assert.equal(method.status, 405);
      assert.equal(head.status, 405);
      assert.equal(unknown.contentLength, String(Buffer.byteLength(unknown.body)));
      assert.equal(method.contentLength, String(Buffer.byteLength(method.body)));
      assert.match(manifest.contentType, /^application\/json/);
      assert.notDeepEqual(JSON.parse(manifest.body), getManifest());
      const copied = getExperimentalAddonManifest();
      copied.name = "mutated";
      assert.notEqual(getExperimentalAddonManifest().name, "mutated");
      assert.equal(JSON.stringify([health, manifest, stream, unknown, method, head]).includes(TOKEN), false);
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("serves repeated HTTP/1.1 health responses over direct and keep-alive connections", async () => {
    const runtime = createExperimentalRealDebridAddonRuntime(config(false), { client: new StaticClient(), parser });
    for (const bind of ["127.0.0.1", "0.0.0.0"] as const) {
      const markers: string[] = [];
      const server = createExperimentalAddonHttpServer({ bind, port: 0, runtime, marker: (value) => markers.push(value) });
      await once(server, "listening");
      const address = server.address() as { port: number };
      const agent = new Agent({ keepAlive: true, maxSockets: 1 });
      try {
        for (let index = 0; index < 3; index += 1) {
          const health = await localRequest(address.port, "/health", "GET", index === 0 ? undefined : agent);
          assert.equal(health.status, 200);
          assert.equal(health.contentType, "application/json; charset=utf-8");
          assert.equal(health.body, '{"status":"ok"}');
          assert.equal(health.contentLength, String(Buffer.byteLength(health.body)));
        }
        assert.equal(markers.filter((value) => value === "EXPERIMENTAL_HTTP_REQUEST_ACCEPTED").length, 3);
        assert.equal(markers.filter((value) => value === "EXPERIMENTAL_HTTP_HEALTH_RESPONSE_STARTED").length, 3);
        assert.equal(markers.filter((value) => value === "EXPERIMENTAL_HTTP_HEALTH_RESPONSE_COMPLETED").length, 3);
        assert.equal(markers.includes("EXPERIMENTAL_HTTP_CLIENT_ABORTED"), false);
        assert.equal(server.listening, true);
      } finally {
        agent.destroy();
        server.close();
        await once(server, "close");
      }
    }
  });

  it("runs the launcher's exact curl client against the real local server without proxy interference", async () => {
    const root = mkdtempSync(join(tmpdir(), "mibr-local-curl-"));
    const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\sh.exe" : "sh";
    try {
      for (const bind of ["127.0.0.1", "0.0.0.0"] as const) {
        const runtime = createExperimentalRealDebridAddonRuntime(config(false), { client: new StaticClient(), parser });
        const server = createExperimentalAddonHttpServer({ bind, port: 0, runtime });
        try {
          server.listen(0, bind);
          await once(server, "listening");
          const address = server.address();
          assert.ok(address && typeof address === "object");
          const suffix = bind === "127.0.0.1" ? "loopback" : "wildcard";
          const headers = join(root, `${suffix}.headers`);
          const body = join(root, `${suffix}.body`);
          const metadata = join(root, `${suffix}.metadata`);
          const pathSetup = process.platform === "win32"
            ? 'h=$(/usr/bin/cygpath -u "$HEADERS"); b=$(/usr/bin/cygpath -u "$BODY"); m=$(/usr/bin/cygpath -u "$METADATA")'
            : 'h="$HEADERS"; b="$BODY"; m="$METADATA"';
          const command = `. lab/real-debrid-addon-runtime/scripts/local-http-client.sh; ${pathSetup}; local_http_get "$PORT" health "$h" "$b" "$m"`;
          const child = spawn(shell, ["-c", command], {
            cwd: process.cwd(),
            stdio: "ignore",
            env: {
              ...process.env,
              PORT: String(address.port),
              HEADERS: headers,
              BODY: body,
              METADATA: metadata,
              HTTP_PROXY: "http://proxy.example.invalid:9",
              HTTPS_PROXY: "http://proxy.example.invalid:9",
              ALL_PROXY: "http://proxy.example.invalid:9",
              NO_PROXY: "",
            },
          });
          const [code] = await once(child, "close");
          assert.equal(code, 0);
          assert.equal(readFileSync(body, "utf8"), '{"status":"ok"}');
          assert.equal(readFileSync(metadata, "utf8").replaceAll("\r\n", "\n"), "200\napplication/json; charset=utf-8\n");
          assert.match(readFileSync(headers, "utf8"), /^HTTP\/1\.1 200/m);
        } finally {
          server.close();
          await once(server, "close");
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("validates sanitized response schemas inside the runtime container contract", () => {
    const validator = "lab/real-debrid-addon-runtime/tools/http-response-validator.ts";
    const run = (kind: string, input: string) => spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", validator, kind], {
      cwd: process.cwd(), encoding: "utf8", input,
    });
    assert.equal(run("health", '{"status":"ok"}\n').status, 0);
    assert.equal(run("manifest", '{"id":"x","name":"x","resources":[]}').status, 0);
    assert.equal(run("stream", '{"streams":[]}').status, 0);
    assert.equal(run("health", '{"status":"bad"}').status, 1);
    assert.equal(run("health", "{").status, 1);
    assert.equal(run("unknown", "{}").status, 1);
  });

  it("does not abort provider work after a normal completed response", async () => {
    const resolver = new FakeTorrentCandidateResolver([{ url: "https://media.example.invalid/stream.mp4", name: "Synthetic", sizeBytes: 1, source: "local-test" }]);
    const runtime = createExperimentalRealDebridAddonRuntime(config(true, TOKEN), {
      client: new StaticClient(), parser,
      wiring: {
        createTransport: () => new FakeRealDebridTransport([]),
        createApiClient: (transport, token) => new RealDebridApiClient(transport, token),
        createResolver: () => resolver,
      },
    });
    const markers: string[] = [];
    const server = createExperimentalAddonHttpServer({ runtime, marker: (value) => markers.push(value) });
    await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    try {
      const normal = await localRequest(port, "/stream/movie/tt0000001.json");
      assert.equal(normal.status, 200);
      assert.equal(resolver.requests[0]?.signal.aborted, false);
      assert.equal(markers.includes("EXPERIMENTAL_HTTP_CLIENT_ABORTED"), false);
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("aborts provider work only for a genuinely premature client disconnect", async () => {
    const resolver = new FakeTorrentCandidateResolver(["wait-for-abort"]);
    const runtime = createExperimentalRealDebridAddonRuntime(config(true, TOKEN), {
      client: new StaticClient(), parser,
      wiring: {
        createTransport: () => new FakeRealDebridTransport([]),
        createApiClient: (transport, token) => new RealDebridApiClient(transport, token),
        createResolver: () => resolver,
      },
    });
    const markers: string[] = [];
    const server = createExperimentalAddonHttpServer({ runtime, marker: (value) => markers.push(value) });
    await once(server, "listening");
    const port = (server.address() as { port: number }).port;

    const call = request({ host: "127.0.0.1", port, path: "/stream/movie/tt0000001.json" });
    call.on("error", () => undefined);
    try {
      call.end();
      await resolver.waitForCall();
      const signal = resolver.requests[0]?.signal;
      assert.ok(signal);
      const aborted = once(signal, "abort");
      call.destroy();
      await aborted;
      assert.equal(signal.aborted, true);
      assert.equal(markers.filter((value) => value === "EXPERIMENTAL_HTTP_CLIENT_ABORTED").length, 1);
    } finally {
      call.destroy();
      server.close();
      await once(server, "close");
    }
  });

  it("uses loopback by default and permits the Docker-only internal bind", async () => {
    const runtime = createExperimentalRealDebridAddonRuntime(config(false), { client: new StaticClient(), parser });
    const local = createExperimentalAddonHttpServer({ runtime });
    await once(local, "listening");
    const localAddress = local.address() as { address: string };
    assert.equal(localAddress.address, "127.0.0.1");
    local.close();
    await once(local, "close");

    const container = createExperimentalAddonHttpServer({ bind: "0.0.0.0", port: 0, runtime });
    await once(container, "listening");
    const containerAddress = container.address() as { address: string };
    assert.equal(containerAddress.address, "0.0.0.0");
    container.close();
    await once(container, "close");

    const compose = readFileSync(new URL("../lab/real-debrid-addon-runtime/compose.yml", import.meta.url), "utf8");
    assert.match(compose, /EXPERIMENTAL_ADDON_HTTP_HOST: "0\.0\.0\.0"/);
    assert.match(compose, /EXPERIMENTAL_ADDON_HTTP_PORT: "7007"/);
    assert.doesNotMatch(compose, /^\s*-\s*"0\.0\.0\.0:/m);

    const dockerfile = readFileSync(new URL("../lab/real-debrid-addon-runtime/Dockerfile.tools", import.meta.url), "utf8");
    assert.match(dockerfile, /ENTRYPOINT \["\/opt\/runtime-tools\/node_modules\/\.bin\/tsx"\]/);
    assert.match(compose, /command: \["\/workspace\/lab\/real-debrid-addon-runtime\/tools\/http-server\.ts"\]/);
    assert.doesNotMatch(compose, /addon-runtime-http-lab:[\s\S]*command:.*dry-run\.ts/);
  });

  it("defines fixed startup markers without exposing configuration or arbitrary errors", () => {
    const tool = readFileSync(new URL("../lab/real-debrid-addon-runtime/tools/http-server.ts", import.meta.url), "utf8");
    const starting = tool.indexOf("EXPERIMENTAL_HTTP_STARTING");
    const listen = tool.indexOf("const server = createExperimentalAddonHttpServer");
    const listening = tool.indexOf("EXPERIMENTAL_HTTP_LISTENING");
    assert.ok(starting >= 0 && starting < listen && listen < listening);
    assert.match(tool, /EXPERIMENTAL_HTTP_CONFIGURATION_ERROR/);
    assert.match(tool, /EXPERIMENTAL_HTTP_RUNTIME_ERROR/);
    assert.doesNotMatch(tool, /console\.(log|error)|\.stack|String\(error\)|error\.message/);
    assert.match(tool, /port !== 7007/);
  });

  it("fails closed with only a fixed marker for invalid tool configuration", () => {
    const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "lab/real-debrid-addon-runtime/tools/http-server.ts"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, EXPERIMENTAL_ADDON_HTTP_HOST: "invalid", EXPERIMENTAL_ADDON_HTTP_PORT: "7007" },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "EXPERIMENTAL_HTTP_STARTING\n");
    assert.equal(result.stderr, "EXPERIMENTAL_HTTP_CONFIGURATION_ERROR\n");
  });

  it("defines a bounded, loopback-only experimental HTTP launcher", () => {
    const launcher = readFileSync(new URL("../lab/real-debrid-addon-runtime/scripts/http-offline.sh", import.meta.url), "utf8");
    const client = readFileSync(new URL("../lab/real-debrid-addon-runtime/scripts/local-http-client.sh", import.meta.url), "utf8");
    assert.match(launcher, /set -eu/);
    assert.match(launcher, /umask 077/);
    assert.match(launcher, /127\.0\.0\.1:\$\{port\}:7007/);
    assert.match(launcher, /\[ "\$attempt" -lt 5 \]/);
    assert.match(client, /--max-redirs\s+0/);
    assert.match(client, /--noproxy\s+'\*'/);
    assert.match(client, /--http1\.1/);
    assert.doesNotMatch(client, /--location/);
    assert.match(launcher, /addon-runtime-http-lab/);
    assert.match(launcher, /down --remove-orphans/);
    assert.match(launcher, /trap .*INT/);
    assert.match(launcher, /trap .*TERM/);
    assert.match(launcher, /trap .*TSTP/);
    assert.match(launcher, /cleanup\(\)/);
    assert.match(launcher, /\[ "\$cleaned" -eq 0 \] \|\| return 0/);
    assert.doesNotMatch(launcher, /REAL_DEBRID_TOKEN=/);
    for (const field of ["serviceContainerPresent", "serviceRunning", "serviceExitCodePresent", "expectedInternalPort", "publishedLoopbackPresent", "serverStartupMarkerPresent", "serverListeningMarkerPresent", "requestAcceptedMarkerPresent", "healthResponseStartedMarkerPresent", "healthResponseCompletedMarkerPresent", "curlExitCategory", "httpStatusPresent", "httpStatusAccepted", "contentTypePresent", "contentTypeAccepted", "bodyPresent", "jsonValid", "healthStatusValid", "diagnosticCategory"]) {
      assert.match(launcher, new RegExp(field));
    }
    assert.doesNotMatch(launcher, /compose logs[^\n]*\|\s*(cat|tee)|docker inspect[^\n]*printf/);
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
      fake("docker", `#!/bin/sh\necho "docker $*" >> "$FAKE_LOG"\ncase "$*" in *" up "*) exit "\${FAKE_UP_STATUS:-0}";; *" ps -a -q "*) [ "\${FAKE_SERVICE_PRESENT:-1}" = 1 ] && echo synthetic-container;; *" ps -q "*) [ "\${FAKE_SERVICE_RUNNING:-1}" = 1 ] && echo synthetic-container;; inspect\\ *State.Running*) [ "\${FAKE_SERVICE_RUNNING:-1}" = 1 ] && echo true || echo false;; inspect\\ *State.ExitCode*) echo 1;; inspect\\ *Path*) [ "\${FAKE_COMMAND_MATCH:-1}" = 1 ] && echo '/opt/runtime-tools/node_modules/.bin/tsx|/workspace/lab/real-debrid-addon-runtime/tools/http-server.ts' || echo mismatch;; *" port "*) [ "\${FAKE_PUBLISHED:-1}" = 1 ] && echo "127.0.0.1:17007";; *" logs "*) [ "\${FAKE_STARTING:-1}" = 1 ] && echo EXPERIMENTAL_HTTP_STARTING; [ "\${FAKE_LISTENING:-1}" = 1 ] && echo EXPERIMENTAL_HTTP_LISTENING; [ "\${FAKE_REQUEST_ACCEPTED:-0}" = 1 ] && echo EXPERIMENTAL_HTTP_REQUEST_ACCEPTED; [ "\${FAKE_HEALTH_STARTED:-0}" = 1 ] && echo EXPERIMENTAL_HTTP_HEALTH_RESPONSE_STARTED; [ "\${FAKE_HEALTH_COMPLETED:-0}" = 1 ] && echo EXPERIMENTAL_HTTP_HEALTH_RESPONSE_COMPLETED; [ "\${FAKE_CONFIG_ERROR:-0}" = 1 ] && echo EXPERIMENTAL_HTTP_CONFIGURATION_ERROR;; *" exec "*) setting=$(cat "$FAKE_RESPONSE_STATE" 2>/dev/null || echo ok); [ "$setting" != invalid ] && [ "$setting" != bad-health ];; *" down "*) exit "\${FAKE_DOWN_STATUS:-0}";; esac\n`);
      fake("mktemp", `#!/bin/sh\necho mktemp >> "$FAKE_LOG"\n/bin/mkdir -p "$FAKE_TEMP_DIR"\nprintf '%s\\n' "$FAKE_TEMP_DIR"\n`);
      fake("chmod", `#!/bin/sh\n/bin/chmod "$@"\n`);
      fake("chown", `#!/bin/sh\necho chown >> "$FAKE_LOG"\n`);
      fake("stat", `#!/bin/sh\necho "stat $*" >> "$FAKE_LOG"\ncase "$*" in *%a*) case "$*" in *compose.override.yml*) echo 600;; *) echo 400;; esac;; *%u*|*%g*) echo 1000;; *%s*) echo 0;; *%F*) echo 'regular file';; *) exit 1;; esac\n`);
      fake("rm", `#!/bin/sh\necho rm >> "$FAKE_LOG"\n[ "\${FAKE_RM_STATUS:-0}" = 0 ] || exit "$FAKE_RM_STATUS"\n/bin/rm "$@"\n`);
      fake("rmdir", `#!/bin/sh\necho rmdir >> "$FAKE_LOG"\n[ "\${FAKE_RMDIR_STATUS:-0}" = 0 ] || exit "$FAKE_RMDIR_STATUS"\n/bin/rmdir "$@"\n`);
      fake("sleep", `#!/bin/sh\necho sleep >> "$FAKE_LOG"\n`);
      fake("curl", `#!/bin/sh\nheaders= body= url=\nwhile [ "$#" -gt 0 ]; do case "$1" in --dump-header) headers=$2; shift 2;; --output) body=$2; shift 2;; --write-out|--proto|--connect-timeout|--max-time|--max-redirs|--request) shift 2;; --silent|--show-error|--fail|--http1.1|--noproxy) [ "$1" = --noproxy ] && shift; shift;; *) url=$1; shift;; esac; done\necho "curl $url" >> "$FAKE_LOG"\ncase "$url" in */health) n=$(cat "$FAKE_COUNT" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$FAKE_COUNT"; setting="\${FAKE_health_MODE:-ok}"; [ "$n" -le "\${FAKE_HEALTH_FAILS:-0}" ] && setting=timeout; mode=health;; */manifest.json) mode=manifest; setting="\${FAKE_manifest_MODE:-ok}";; *) mode=stream; setting="\${FAKE_stream_MODE:-ok}";; esac\nprintf '%s' "$setting" > "$FAKE_RESPONSE_STATE"\ncase "$setting" in connect) exit 7;; http-exit) exit 22;; timeout) exit 28;; protocol) exit 35;; empty-reply) exit 52;; reset) exit 56;; esac\ncase "$mode" in health) payload='{"status":"ok"}';; manifest) payload='{"id":"experimental","name":"experimental","resources":["stream"]}';; stream) payload='{"streams":[]}';; esac\ncase "$setting" in invalid) payload='{' ;; bad-health) payload='{"status":"bad"}' ;; status) code=500;; redirect) code=302;; *) code=200;; esac\ncontent_type='application/json'; [ "$setting" = charset ] && content_type='application/json; charset=utf-8'; [ "$setting" = no-content-type ] && content_type=''; [ "$setting" = no-body ] && payload='';\nprintf 'HTTP/1.1 %s OK\\r\\nContent-Type: %s\\r\\n\\r\\n' "$code" "$content_type" > "$headers"\nif [ "$setting" = newline ]; then printf '%s\\n' "$payload" > "$body"; else printf '%s' "$payload" > "$body"; fi\n[ "$setting" = no-status ] || printf '%s\\n%s\\n' "$code" "$content_type"\n`);
      const cases = [
        ["success", "0", "0", "1", "ok", "ok", "1", "1", "1", ""], ["up", "17", "0", "0", "ok", "ok", "1", "1", "1", ""],
        ["service-not-created", "0", "0", "0", "ok", "ok", "0", "0", "0", "SERVICE_NOT_CREATED"], ["service-exited", "0", "0", "0", "ok", "ok", "0", "1", "1", "SERVICE_EXITED"],
        ["command-mismatch", "0", "5", "5", "ok", "ok", "1", "1", "0", "COMMAND_MISMATCH"], ["listen-not-confirmed", "0", "5", "5", "ok", "ok", "1", "1", "0", "LISTEN_NOT_CONFIRMED"],
        ["configuration-missing", "0", "5", "5", "ok", "ok", "1", "1", "0", "CONFIGURATION_MISSING"], ["connection-reset", "0", "0", "5", "reset", "ok", "1", "1", "1", "CONNECTION_RESET"],
        ["health-timeout", "0", "5", "5", "ok", "ok", "1", "1", "1", "HEALTH_TIMEOUT"], ["health-last", "0", "4", "5", "ok", "ok", "1", "1", "1", ""],
        ["health-connect", "0", "0", "5", "ok", "ok", "1", "1", "1", "HEALTH_TIMEOUT"], ["health-http-exit", "0", "0", "5", "ok", "ok", "1", "1", "1", "HEALTH_TIMEOUT"],
        ["health-protocol", "0", "0", "5", "ok", "ok", "1", "1", "1", "HEALTH_TIMEOUT"], ["health-empty-reply", "0", "0", "5", "ok", "ok", "1", "1", "1", "HEALTH_TIMEOUT"],
        ["health-no-content-type", "0", "0", "5", "ok", "ok", "1", "1", "1", "HEALTH_TIMEOUT"], ["health-no-body", "0", "0", "5", "ok", "ok", "1", "1", "1", "HEALTH_TIMEOUT"],
        ["health-no-status", "0", "0", "5", "ok", "ok", "1", "1", "1", "HEALTH_TIMEOUT"], ["health-bad-status", "0", "0", "5", "ok", "ok", "1", "1", "1", "HEALTH_TIMEOUT"],
        ["health-charset", "0", "0", "1", "ok", "ok", "1", "1", "1", ""], ["health-newline", "0", "0", "1", "ok", "ok", "1", "1", "1", ""],
        ["health-redirect", "0", "0", "5", "ok", "ok", "1", "1", "1", "HEALTH_TIMEOUT"], ["manifest-invalid", "0", "0", "1", "invalid", "ok", "1", "1", "1", ""], ["stream-invalid", "0", "0", "1", "ok", "invalid", "1", "1", "1", ""],
        ["manifest-http", "0", "0", "1", "status", "ok", "1", "1", "1", ""], ["stream-http", "0", "0", "1", "ok", "status", "1", "1", "1", ""], ["manifest-redirect", "0", "0", "1", "redirect", "ok", "1", "1", "1", ""], ["stream-redirect", "0", "0", "1", "ok", "redirect", "1", "1", "1", ""],
      ] as const;
      for (const [name, up, healthFails, expectedHealth, manifestMode, streamMode, running, present, listening, category] of cases) {
        rmSync(log, { force: true }); rmSync(work, { recursive: true, force: true }); rmSync(join(root, "count"), { force: true });
        const command = process.platform === "win32" ? 'export PATH="$(/usr/bin/cygpath -u "$TEST_BIN"):$PATH"; exec /bin/sh "$TEST_LAUNCHER"' : 'export PATH="$TEST_BIN:$PATH"; exec sh "$TEST_LAUNCHER"';
        const successful = name === "success" || name === "health-last" || name === "health-charset" || name === "health-newline";
        const healthMode = ({
          "health-redirect": "redirect", "connection-reset": "reset", "health-connect": "connect", "health-http-exit": "http-exit",
          "health-protocol": "protocol", "health-empty-reply": "empty-reply", "health-no-content-type": "no-content-type",
          "health-no-body": "no-body", "health-no-status": "no-status", "health-bad-status": "bad-health",
          "health-charset": "charset", "health-newline": "newline",
        } as Record<string, string>)[name] ?? "ok";
        const result = spawnSync(shell, ["-c", command], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, TEST_BIN: bin, TEST_LAUNCHER: "lab/real-debrid-addon-runtime/scripts/http-offline.sh", FAKE_LOG: log, FAKE_TEMP_DIR: work, FAKE_COUNT: join(root, "count"), FAKE_RESPONSE_STATE: join(root, "response-state"), FAKE_UP_STATUS: up, FAKE_HEALTH_FAILS: healthFails, FAKE_SERVICE_RUNNING: running, FAKE_SERVICE_PRESENT: present, FAKE_COMMAND_MATCH: name === "command-mismatch" ? "0" : "1", FAKE_STARTING: "1", FAKE_LISTENING: listening, FAKE_REQUEST_ACCEPTED: name === "connection-reset" ? "0" : "1", FAKE_HEALTH_STARTED: name === "connection-reset" ? "0" : "1", FAKE_HEALTH_COMPLETED: successful ? "1" : "0", FAKE_CONFIG_ERROR: name === "configuration-missing" ? "1" : "0", FAKE_health_MODE: healthMode, FAKE_manifest_MODE: manifestMode, FAKE_stream_MODE: streamMode, FAKE_DOWN_STATUS: name === "success" ? "9" : "0", FAKE_RM_STATUS: "0", FAKE_RMDIR_STATUS: "0" } });
        assert.equal(result.status, name === "up" ? 17 : successful ? 0 : 1, `${name}: ${result.stdout} ${result.stderr}`);
        const calls = readFileSync(log, "utf8").trim().split("\n");
        assert.equal(calls.filter((x) => x.includes(" down ")).length, 1);
        assert.equal(calls.filter((x) => x.includes(" up ")).length, 1);
        const configIndex = calls.findIndex((x) => x.includes(" config "));
        if (configIndex !== -1) assert.ok(calls.indexOf("chown") < configIndex);
        assert.equal(calls.filter((x) => x.includes("/health")).length, Number(expectedHealth));
        if (category) assert.match(result.stdout, new RegExp(`diagnosticCategory: ${category}`));
        const expectedCurlCategory = ({
          "connection-reset": "CONNECTION_RESET", "health-connect": "CONNECT_FAILED", "health-http-exit": "HTTP_ERROR",
          "health-timeout": "TIMEOUT", "health-protocol": "PROTOCOL_ERROR", "health-empty-reply": "PROTOCOL_ERROR",
          "health-redirect": "SUCCESS", "health-no-content-type": "SUCCESS", "health-no-body": "SUCCESS",
          "health-no-status": "SUCCESS", "health-bad-status": "SUCCESS",
        } as Record<string, string>)[name];
        if (expectedCurlCategory) assert.match(result.stdout, new RegExp(`curlExitCategory: ${expectedCurlCategory}`));
        if (name === "connection-reset") {
          assert.match(result.stdout, /requestAcceptedMarkerPresent: NAO/);
          assert.match(result.stdout, /healthResponseStartedMarkerPresent: NAO/);
          assert.match(result.stdout, /healthResponseCompletedMarkerPresent: NAO/);
        }
        if (name === "health-timeout") {
          assert.match(result.stdout, /requestAcceptedMarkerPresent: SIM/);
          assert.match(result.stdout, /healthResponseStartedMarkerPresent: SIM/);
          assert.match(result.stdout, /healthResponseCompletedMarkerPresent: NAO/);
        }
        assert.equal(calls.filter((x) => x.includes("/manifest.json")).length, name === "up" || category !== "" ? 0 : 1);
        assert.equal(calls.filter((x) => x.includes("tt0000001")).length, successful || name === "stream-invalid" || name === "stream-http" || name === "stream-redirect" ? 1 : 0);
        assert.equal(result.stdout.includes("127.0.0.1"), false);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
