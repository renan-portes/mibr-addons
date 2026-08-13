import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { getManifest } from "../src/addon/manifest.js";
import { getExperimentalAddonManifest } from "../src/runtime/experimental/experimentalAddonManifest.js";

const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\sh.exe" : "sh";

describe("experimental addon client access launcher", () => {
  it("keeps a stable, separate and non-sensitive experimental manifest", () => {
    const manifest = getExperimentalAddonManifest();
    assert.equal(manifest.id, "community.mibr.experimental.runtime");
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.deepEqual(manifest.resources, ["stream"]);
    assert.deepEqual(manifest.types, ["movie", "series"]);
    assert.notDeepEqual(manifest, getManifest());
    assert.deepEqual(getManifest(), {
      id: "community.mibr.addons",
      name: "MIBR Addons",
      version: "0.2.0",
      description: "Modular media addon with independent providers.",
      resources: ["stream"],
      types: ["movie", "series"],
      idPrefixes: ["tt"],
    });
    const serialized = JSON.stringify(manifest);
    assert.doesNotMatch(serialized, /token|authorization|real-debrid|https?:\/\//i);
  });

  it("defines strict authorization, bounded exposure and idempotent cleanup", () => {
    const source = readFileSync(new URL("../lab/real-debrid-addon-runtime/scripts/client-access.sh", import.meta.url), "utf8");
    assert.match(source, /EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED:-}" = true/);
    assert.match(source, /EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED:-}" = true/);
    assert.match(source, /LOOPBACK\) \[ "\$host" = 127\.0\.0\.1 \]/);
    assert.match(source, /LAN\)/);
    assert.match(source, /is_private_ipv4/);
    assert.match(source, /ip -o -4 addr show up/);
    assert.match(source, /ss -H -ltn/);
    assert.match(source, /down --remove-orphans/);
    assert.match(source, /\[ "\$cleaned" -eq 0 \] \|\| return 0/);
    assert.match(source, /trap .*INT/);
    assert.match(source, /trap .*TERM/);
    assert.match(source, /trap .*TSTP/);
    assert.doesNotMatch(source, /0\.0\.0\.0:\$\{port\}:7007|host[_ -]?network|REAL_DEBRID_TOKEN=/i);
    const offline = readFileSync(new URL("../lab/real-debrid-addon-runtime/scripts/http-offline.sh", import.meta.url), "utf8");
    assert.doesNotMatch(offline, /CLIENT_ACCESS_READY|CLIENT_ACCESS_AUTHORIZED|LAN_ACCESS_AUTHORIZED/);
    const bootstrap = readFileSync(new URL("../src/app/bootstrap.ts", import.meta.url), "utf8");
    const router = readFileSync(new URL("../src/server/router.ts", import.meta.url), "utf8");
    const compose = readFileSync(new URL("../lab/real-debrid-addon-runtime/compose.yml", import.meta.url), "utf8");
    assert.doesNotMatch(bootstrap, /client-access|experimentalAddon/i);
    assert.doesNotMatch(router, /client-access|CLIENT_ACCESS_READY|experimental\/manifest/i);
    assert.doesNotMatch(compose, /client-access|127\.0\.0\.1:|published:/i);
  });

  it("executes authorized loopback and LAN modes with only controlled fake commands", () => {
    const root = mkdtempSync(join(tmpdir(), "mibr-client-access-"));
    const bin = join(root, "bin");
    const fake = (name: string, source: string) => {
      const path = join(bin, name);
      writeFileSync(path, source);
      chmodSync(path, 0o700);
    };
    try {
      mkdirSync(bin, { recursive: true });
      fake("mktemp", `#!/bin/sh\n/bin/mkdir -p "$FAKE_TEMP_DIR"\nprintf '%s\\n' "$FAKE_TEMP_DIR"\n`);
      fake("chown", `#!/bin/sh\nexit "\${FAKE_CHOWN_STATUS:-0}"\n`);
      fake("chmod", `#!/bin/sh\n/bin/chmod "$@"\nif [ "$1" = 600 ] && [ "\${FAKE_OVERRIDE_MUTATION:-}" != "" ]; then\n  case "$FAKE_OVERRIDE_MUTATION" in\n    extra) printf '      - "127.0.0.1:17008:7007"\\n' >> "$2";;\n    target) printf '      - "127.0.0.1:17008:7008"\\n' >> "$2";;\n    wildcard) /bin/sed -i 's/127.0.0.1/0.0.0.0/' "$2";;\n    long) /bin/sed -i '4c\\      - target: 7007\\n        published: 17007\\n        host_ip: 127.0.0.1' "$2";;\n    range) /bin/sed -i '4c\\      - "127.0.0.1:17007-17008:7007"' "$2";;\n    udp) /bin/sed -i '4c\\      - "127.0.0.1:17007:7007/udp"' "$2";;\n    outside) printf '  unrelated-service:\\n    ports: ["17008:7008"]\\n' >> "$2";;\n  esac\nfi\n`);
      fake("stat", `#!/bin/sh\ncase "$*" in *%a*) case "$*" in *compose.override.yml*) echo 600;; *) echo 400;; esac;; *%u*|*%g*) echo 1000;; *) exit 1;; esac\n`);
      fake("ss", `#!/bin/sh\n[ "\${FAKE_PORT_OCCUPIED:-0}" = 1 ] && echo 'LISTEN 0 1 127.0.0.1:17007'\n`);
      fake("ip", `#!/bin/sh\nprintf '1: eth0 inet %s/24 scope global eth0\\n' "\${FAKE_LOCAL_IP:-192.168.50.10}"\n`);
      fake("sleep", `#!/bin/sh\necho sleep >> "$FAKE_LOG"\ncase "\${FAKE_SIGNAL:-}" in INT) kill -INT "$PPID";; TERM) kill -TERM "$PPID";; TSTP) kill -TSTP "$PPID";; esac\nexit 0\n`);
      fake("rm", `#!/bin/sh\necho rm >> "$FAKE_LOG"\n[ "\${FAKE_RM_STATUS:-0}" = 0 ] || exit "$FAKE_RM_STATUS"\n/bin/rm "$@"\n`);
      fake("rmdir", `#!/bin/sh\necho rmdir >> "$FAKE_LOG"\n[ "\${FAKE_RMDIR_STATUS:-0}" = 0 ] || exit "$FAKE_RMDIR_STATUS"\n/bin/rmdir "$@"\n`);
      fake("docker", `#!/bin/sh\necho "docker $*" >> "$FAKE_LOG"\nprintf '%s\\n' "\${FAKE_DOCKER_STDERR:-}" >&2\n[ "\${REAL_DEBRID_ADDON_RUNTIME_ENABLED:-}" = false ] || exit 91\n[ -n "\${REAL_DEBRID_TOKEN_FILE_HOST:-}" ] || exit 92\ncase "$*" in *" config"*)\n  previous=; override=; for argument do if [ "$previous" = -f ]; then override=$argument; fi; previous=$argument; done\n  /bin/cp "$override" "$FAKE_OVERRIDE_CAPTURE"\n  exit "\${FAKE_CONFIG_STATUS:-0}";;\n  *" up "*) exit "\${FAKE_UP_STATUS:-0}";;\n  *" exec "*) [ "$(cat "$FAKE_RESPONSE_STATE" 2>/dev/null || echo ok)" != schema-invalid ];;\n  *" down "*) exit "\${FAKE_DOWN_STATUS:-0}";; esac\n`);
      fake("curl", `#!/bin/sh\nheaders= body= url=\nwhile [ "$#" -gt 0 ]; do case "$1" in --dump-header) headers=$2; shift 2;; --output) body=$2; shift 2;; --write-out|--proto|--connect-timeout|--max-time|--max-redirs|--request) shift 2;; --noproxy) shift 2;; --silent|--show-error|--fail|--http1.1) shift;; *) url=$1; shift;; esac; done\necho "curl $url" >> "$FAKE_LOG"\ncase "$url" in */health) n=$(cat "$FAKE_COUNT" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$FAKE_COUNT"; [ "$n" -le "\${FAKE_HEALTH_FAILS:-0}" ] && exit 28; mode=health; payload='{"status":"ok"}';; */manifest.json) mode=manifest; payload='{"id":"experimental","name":"experimental","resources":["stream"]}';; *) mode=stream; payload='{"streams":[]}';; esac\neval setting=\${FAKE_\${mode}_MODE:-ok}\nprintf '%s' "$setting" > "$FAKE_RESPONSE_STATE"\n[ "$setting" = http ] && { printf '%s\\n' "\${FAKE_CURL_STDERR:-}" >&2; exit 22; }\n[ "$setting" = schema-invalid ] && payload='{"unexpected":true}'\nprintf 'HTTP/1.1 200 OK\\r\\nContent-Type: application/json; charset=utf-8\\r\\n\\r\\n' > "$headers"\nprintf '%s' "$payload" > "$body"\nprintf '200\\napplication/json; charset=utf-8\\n'\n`);

      // Replace the generic curl stub with a strictly POSIX variant; nested
      // parameter expansion is not portable across the shells used by CI.
      fake("curl", `#!/bin/sh\nheaders= body= url=\nwhile [ "$#" -gt 0 ]; do case "$1" in --dump-header) headers=$2; shift 2;; --output) body=$2; shift 2;; --write-out|--proto|--connect-timeout|--max-time|--max-redirs|--request) shift 2;; --noproxy) shift 2;; --silent|--show-error|--fail|--http1.1) shift;; *) url=$1; shift;; esac; done\necho "curl $url" >> "$FAKE_LOG"\ncase "$url" in */health) n=$(cat "$FAKE_COUNT" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$FAKE_COUNT"; [ "$n" -le "\${FAKE_HEALTH_FAILS:-0}" ] && exit 28; payload='{"status":"ok"}'; setting=\${FAKE_health_MODE:-ok};; */manifest.json) payload='{"id":"experimental","name":"experimental","resources":["stream"]}'; setting=\${FAKE_manifest_MODE:-ok};; *) payload='{"streams":[]}'; setting=\${FAKE_stream_MODE:-ok};; esac\nprintf '%s' "$setting" > "$FAKE_RESPONSE_STATE"\n[ "$setting" = http ] && { printf '%s\\n' "\${FAKE_CURL_STDERR:-}" >&2; exit 22; }\n[ "$setting" = schema-invalid ] && payload='{"unexpected":true}'\nprintf 'HTTP/1.1 200 OK\\r\\nContent-Type: application/json; charset=utf-8\\r\\n\\r\\n' > "$headers"\nprintf '%s' "$payload" > "$body"\nprintf '200\\napplication/json; charset=utf-8\\n'\n`);

      const run = (name: string, extra: NodeJS.ProcessEnv = {}) => {
        const work = join(root, `work-${name}`);
        const log = join(root, `log-${name}`);
        const command = process.platform === "win32"
          ? 'export PATH="$(/usr/bin/cygpath -u "$TEST_BIN"):$PATH"; exec /bin/sh "$TEST_LAUNCHER"'
          : 'export PATH="$TEST_BIN:$PATH"; exec sh "$TEST_LAUNCHER"';
        const result = spawnSync(shell, ["-c", command], {
          cwd: process.cwd(), encoding: "utf8",
          env: {
            ...process.env, TEST_BIN: bin, TEST_LAUNCHER: "lab/real-debrid-addon-runtime/scripts/client-access.sh",
            FAKE_TEMP_DIR: work, FAKE_LOG: log, FAKE_COUNT: join(root, `count-${name}`), FAKE_RESPONSE_STATE: join(root, `response-${name}`),
            FAKE_OVERRIDE_CAPTURE: join(root, `override-${name}`), EXPERIMENTAL_ADDON_CLIENT_ACCESS_TIMEOUT_SECONDS: "1", ...extra,
          },
        });
        const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
        return { result, calls };
      };

      for (const [name, env] of [
        ["missing", {}], ["false", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "false" }],
        ["truthy", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "1" }], ["whitespace", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: " true " }],
        ["lan-no-auth", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE: "LAN", EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST: "192.168.50.10" }],
        ["lan-public", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE: "LAN", EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST: "8.8.8.8" }],
        ["lan-any", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE: "LAN", EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST: "0.0.0.0" }],
        ["lan-loopback", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE: "LAN", EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST: "127.0.0.1" }],
        ["lan-link-local", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE: "LAN", EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST: "169.254.1.2" }],
        ["lan-multicast", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE: "LAN", EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST: "224.0.0.1" }],
        ["lan-hostname", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE: "LAN", EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST: "docker-server" }],
        ["lan-ipv6", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE: "LAN", EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST: "fd00::1" }],
        ["lan-not-local", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE: "LAN", EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST: "192.168.50.11" }],
        ["bad-port", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_PORT: "80" }],
        ["empty-port", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_PORT: "" }],
        ["decimal-port", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_PORT: "17007.5" }],
        ["negative-port", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_PORT: "-1" }],
        ["below-min-port", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_PORT: "1023" }],
        ["high-port", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_PORT: "65536" }],
        ["high-timeout", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_TIMEOUT_SECONDS: "3601" }],
        ["occupied", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", FAKE_PORT_OCCUPIED: "1" }],
      ] as const) {
        const { result, calls } = run(name, env);
        assert.equal(result.status, 2, `${name}: ${result.stdout} ${result.stderr}`);
        assert.equal(calls.some((call) => call.startsWith("docker ")), false);
      }

      for (const [name, env, mode] of [
        ["loopback", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true" }, "LOOPBACK"],
        ["lan", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE: "LAN", EXPERIMENTAL_ADDON_LAN_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST: "192.168.50.10" }, "LAN"],
      ] as const) {
        const { result, calls } = run(name, env);
        assert.equal(result.status, 0, `${name}: ${result.stdout} ${result.stderr}`);
        assert.match(result.stdout, /CLIENT_ACCESS_READY/);
        assert.match(result.stdout, new RegExp(`accessMode: ${mode}`));
        assert.equal(result.stdout.includes("http://"), false);
        const config = calls.findIndex((call) => call.includes(" config"));
        const up = calls.findIndex((call) => call.includes(" up "));
        const health = calls.findIndex((call) => call.includes("/health"));
        const manifest = calls.findIndex((call) => call.includes("/manifest.json"));
        const stream = calls.findIndex((call) => call.includes("tt0000001"));
        assert.ok(config >= 0 && config < up && up < health && health < manifest && manifest < stream);
        assert.equal(calls.filter((call) => call.includes("/manifest.json")).length, 1);
        assert.equal(calls.filter((call) => call.includes("tt0000001")).length, 1);
        assert.equal(calls.filter((call) => call.includes(" down ")).length, 1);
        assert.equal(result.stdout.includes("token"), false);
        const override = readFileSync(join(root, `override-${name}`), "utf8").trim().split("\n");
        assert.equal(override.length, 4);
        assert.equal(override.filter((line) => line.includes(":7007")).length, 1);
        assert.equal(override[3], mode === "LOOPBACK" ? '      - "127.0.0.1:17007:7007"' : '      - "192.168.50.10:17007:7007"');
      }

      for (const [signal, code] of [["INT", 130], ["TERM", 143], ["TSTP", 146]] as const) {
        const signaled = run(`signal-${signal}`, { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", FAKE_SIGNAL: signal, FAKE_HEALTH_FAILS: "1" });
        assert.equal(signaled.result.status, code);
        assert.equal(signaled.calls.filter((call) => call.includes(" down ")).length, 1);
        assert.equal(signaled.calls.filter((call) => call === "rm").length, 1);
        assert.equal(signaled.calls.filter((call) => call === "rmdir").length, 1);
        assert.equal(signaled.calls.filter((call) => call.includes(" up ")).length, 1);
        assert.equal(signaled.calls.filter((call) => call.includes("/manifest.json")).length, 0);
        assert.equal(signaled.calls.filter((call) => call.includes("/health")).length, 1);
        assert.equal(signaled.result.stdout.includes("CLIENT_ACCESS_READY"), false);
      }

      const signalCleanupFailure = run("signal-cleanup-failure", {
        EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", FAKE_SIGNAL: "TERM", FAKE_HEALTH_FAILS: "1", FAKE_DOWN_STATUS: "19", FAKE_RM_STATUS: "20", FAKE_RMDIR_STATUS: "21",
        FAKE_DOCKER_STDERR: "synthetic-token Authorization: Bearer synthetic /temporary/path http://private.invalid stack trace",
      });
      assert.equal(signalCleanupFailure.result.status, 143);
      assert.equal(signalCleanupFailure.calls.filter((call) => call.includes(" down ")).length, 1);
      assert.equal(signalCleanupFailure.calls.filter((call) => call === "rm").length, 1);
      assert.equal(signalCleanupFailure.calls.filter((call) => call === "rmdir").length, 1);
      assert.match(signalCleanupFailure.result.stdout, /COMPOSE_DOWN_FAILED/);
      assert.doesNotMatch(signalCleanupFailure.result.stdout + signalCleanupFailure.result.stderr, /synthetic-token|Authorization|temporary|private\.invalid|stack trace/);

      const configFailure = run("config-failure", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", FAKE_CONFIG_STATUS: "17" });
      assert.equal(configFailure.result.status, 17);
      assert.equal(configFailure.calls.filter((call) => call.includes(" up ")).length, 0);
      assert.equal(configFailure.calls.filter((call) => call === "rm").length, 1);
      assert.equal(configFailure.calls.filter((call) => call === "rmdir").length, 1);
      assert.match(configFailure.result.stdout, /COMPOSE_CONFIG_FAILED/);

      const upFailure = run("up-failure", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", FAKE_UP_STATUS: "18" });
      assert.equal(upFailure.result.status, 18);
      assert.equal(upFailure.calls.filter((call) => call.includes(" up ")).length, 1);
      assert.equal(upFailure.calls.filter((call) => call.includes(" down ")).length, 1);
      assert.match(upFailure.result.stdout, /COMPOSE_UP_FAILED/);

      const healthFailure = run("health-failure", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", FAKE_HEALTH_FAILS: "5" });
      assert.equal(healthFailure.result.status, 1, `${healthFailure.result.stdout} ${healthFailure.result.stderr}\n${healthFailure.calls.join("\n")}`);
      assert.equal(healthFailure.calls.filter((call) => call.includes("/health")).length, 5);
      assert.equal(healthFailure.calls.some((call) => call.includes("/manifest.json")), false);
      assert.equal(healthFailure.calls.filter((call) => call.includes(" down ")).length, 1);
      assert.equal(healthFailure.result.stdout.includes("CLIENT_ACCESS_READY"), false);

      for (const [name, env, manifestCalls, streamCalls] of [
        ["manifest-http", { FAKE_manifest_MODE: "http" }, 1, 0],
        ["manifest-schema", { FAKE_manifest_MODE: "schema-invalid" }, 1, 0],
        ["stream-http", { FAKE_stream_MODE: "http" }, 1, 1],
        ["stream-schema", { FAKE_stream_MODE: "schema-invalid" }, 1, 1],
      ] as const) {
        const failure = run(name, {
          EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", ...env,
          FAKE_CURL_STDERR: "synthetic-token Authorization raw-response http://private.invalid stack trace",
        });
        assert.equal(failure.result.status, 1, `${name}: ${failure.result.stdout} ${failure.result.stderr}`);
        assert.equal(failure.calls.filter((call) => call.includes("/manifest.json")).length, manifestCalls);
        assert.equal(failure.calls.filter((call) => call.includes("tt0000001")).length, streamCalls);
        assert.equal(failure.calls.filter((call) => call.includes(" down ")).length, 1);
        assert.equal(failure.result.stdout.includes("CLIENT_ACCESS_READY"), false);
        assert.doesNotMatch(failure.result.stdout + failure.result.stderr, /synthetic-token|Authorization|raw-response|private\.invalid|stack trace/);
      }

      for (const [name, env] of [
        ["min-port", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_PORT: "1024" }],
        ["max-port", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_PORT: "65535" }],
        ["max-timeout", { EXPERIMENTAL_ADDON_CLIENT_ACCESS_TIMEOUT_SECONDS: "3600" }],
      ] as const) {
        const boundary = run(name, { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", ...env });
        assert.equal(boundary.result.status, 0, `${name}: ${boundary.result.stdout} ${boundary.result.stderr}`);
      }

      for (const mutation of ["extra", "target", "wildcard", "long", "range", "udp", "outside"]) {
        const rejected = run(`override-${mutation}`, { EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", FAKE_OVERRIDE_MUTATION: mutation });
        assert.equal(rejected.result.status, 2, mutation);
        assert.equal(rejected.calls.some((call) => call.startsWith("docker ")), false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
