import assert from "node:assert/strict";
import { chmodSync, chownSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { createExperimentalRealDebridClientMode, ExperimentalRealDebridClientModeError } from "../src/runtime/experimental/experimentalRealDebridClientMode.js";

describe("experimental Real-Debrid client mode", () => {
  const fakeFileSystem = (candidateText: string) => Object.freeze({
    lstat: () => ({ isFile: () => true, isSymbolicLink: () => false, uid: 1000, gid: 1000, mode: 0o100400, size: candidateText.length }),
    readFile: (path: string) => path === "token" ? "synthetic-token" : candidateText,
  });
  const validCandidate = (id: string) => ({ imdbId: id, type: "movie", magnet: `magnet:?xt=urn:btih=${"a".repeat(40)}`, infoHash: "a".repeat(40), filePath: "safe/video.mkv", fileBytes: 1 });
  for (const [label, payload, allowlist] of [
    ["invalid JSON", "{", "tt0000001"],
    ["empty array", "[]", "tt0000001"],
    ["five candidates", JSON.stringify(["1","2","3","4","5"].map((n) => validCandidate(`tt000000${n}`))), "tt0000001,tt0000002,tt0000003,tt0000004"],
    ["duplicate IMDb", JSON.stringify([validCandidate("tt0000001"), validCandidate("tt0000001")]), "tt0000001,tt0000002"],
  ] as const) {
    it(`rejects candidates with ${label} using injected filesystem`, () => {
      let error: unknown; try { createExperimentalRealDebridClientMode({ EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true", REAL_DEBRID_TOKEN_FILE: "token", EXPERIMENTAL_ADDON_CANDIDATES_FILE: "candidates", EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: allowlist }, fakeFileSystem(payload)); } catch (caught) { error = caught; }
      assert.ok(error instanceof ExperimentalRealDebridClientModeError);
      assert.doesNotMatch(String(error), /synthetic-token|magnet|safe\/video|aaaa/i);
      const keys = Object.keys(error as object);
      assert.deepEqual(keys, ["name"]);
      const spread = { ...(error as unknown as Record<string, unknown>) };
      assert.deepEqual(Object.keys(spread), ["name"]);
      assert.equal(spread.name, "ExperimentalRealDebridClientModeError");
      const serialized = JSON.stringify(error);
      assert.doesNotMatch(serialized, /synthetic-token|magnet|safe\/video|aaaa|authorization|fileBytes/i);
      assert.match((error as Error).message, /^Experimental Real-Debrid client mode rejected \(configuration_invalid\)$/);
    });
  }
  for (const [label, candidate, allowlist] of [
    ["invalid IMDb", { ...validCandidate("invalid"), imdbId: "invalid" }, "tt0000001"],
    ["invalid type", { ...validCandidate("tt0000001"), type: "other" }, "tt0000001"],
    ["invalid magnet", { ...validCandidate("tt0000001"), magnet: "not-a-magnet" }, "tt0000001"],
    ["invalid infoHash", { ...validCandidate("tt0000001"), infoHash: "invalid" }, "tt0000001"],
  ] as const) {
    it(`rejects candidate with ${label} using injected filesystem`, () => {
      let error: unknown;
      try { createExperimentalRealDebridClientMode({ EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true", REAL_DEBRID_TOKEN_FILE: "token", EXPERIMENTAL_ADDON_CANDIDATES_FILE: "candidates", EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: allowlist }, fakeFileSystem(JSON.stringify([candidate]))); } catch (caught) { error = caught; }
      assert.ok(error instanceof ExperimentalRealDebridClientModeError);
      assert.doesNotMatch(String(error), /synthetic-token|magnet:\?|safe\/video|aaaa/i);
      assert.deepEqual(Object.keys(error as object), ["name"]);
      assert.deepEqual(Object.keys({ ...(error as unknown as Record<string, unknown>) }), ["name"]);
      assert.doesNotMatch(JSON.stringify(error), /synthetic-token|magnet|safe\/video|aaaa|authorization/i);
    });
  }
  it("rejects an empty regular candidates source before Compose", () => {
    const root = mkdtempSync(join(tmpdir(), "mibr-candidates-empty-")); const bin = join(root, "bin"); const token = join(root, "token"); const candidates = join(root, "candidates.json");
    try {
      mkdirSync(bin); writeFileSync(token, "SYNTHETIC_REAL_DEBRID_TOKEN_DO_NOT_LEAK"); writeFileSync(candidates, "");
      for (const [name, source] of [["chown", "#!/bin/sh\nexit 0\n"], ["chmod", "#!/bin/sh\nexit 0\n"]] as const) { const file = join(bin, name); writeFileSync(file, source); chmodSync(file, 0o700); }
      const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "sh"; const shellBin = process.platform === "win32" ? `/${bin.replaceAll("\\", "/").charAt(0).toLowerCase()}${bin.replaceAll("\\", "/").slice(2)}` : bin;
      const result = spawnSync(shell, ["-c", process.platform === "win32" ? 'chown(){ "$FAKE_BIN/chown" "$@";}; chmod(){ "$FAKE_BIN/chmod" "$@";}; . lab/real-debrid-addon-runtime/scripts/real-client-access.sh' : ". lab/real-debrid-addon-runtime/scripts/real-client-access.sh"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, PATH: `${shellBin}:/usr/bin:/bin`, FAKE_BIN: shellBin, EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_TOKEN_FILE: token, EXPERIMENTAL_ADDON_CANDIDATES_FILE: candidates, EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: "tt0000001" } });
      assert.equal(result.status, 2); assert.equal(result.signal, null); assert.equal(result.stderr, ""); assert.equal(result.stdout, "CONFIGURATION_INVALID\n"); assert.doesNotMatch(result.stdout, /CLIENT_ACCESS_READY|REAL_DEBRID_MODE_ENABLED|SYNTHETIC|magnet|Authorization/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  for (const candidateCase of ["missing-variable", "nonexistent", "symlink"] as const) {
    it(`rejects ${candidateCase} candidates source before Compose`, (context) => {
      const root = mkdtempSync(join(tmpdir(), "mibr-candidates-source-")); const token = join(root, "token"); const candidateLink = join(root, "candidates-link");
      try {
        writeFileSync(token, "SYNTHETIC_REAL_DEBRID_TOKEN_DO_NOT_LEAK");
        let candidatePath: string | undefined;
        if (candidateCase === "nonexistent") candidatePath = join(root, "missing.json");
        if (candidateCase === "symlink") {
          const target = join(root, "target.json"); writeFileSync(target, "[]");
          try { symlinkSync(target, candidateLink); } catch { context.skip("runner cannot create a controlled symlink"); return; }
          candidatePath = candidateLink;
        }
        const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "sh";
        const env = { ...process.env, EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_TOKEN_FILE: token, EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: "tt0000001" } as NodeJS.ProcessEnv;
        if (candidatePath !== undefined) env.EXPERIMENTAL_ADDON_CANDIDATES_FILE = candidatePath;
        const result = spawnSync(shell, ["-c", ". lab/real-debrid-addon-runtime/scripts/real-client-access.sh"], { cwd: process.cwd(), encoding: "utf8", env });
        assert.equal(result.status, 2); assert.equal(result.signal, null); assert.equal(result.stderr, ""); assert.equal(result.stdout, "TOKEN_FILE_INVALID\n"); assert.doesNotMatch(result.stdout, /CLIENT_ACCESS_READY|REAL_DEBRID_MODE_ENABLED|SYNTHETIC|magnet|Authorization/i);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
  it("rejects an ephemeral token whose mode is not 0400", () => {
    const root = mkdtempSync(join(tmpdir(), "mibr-token-mode-")); const bin = join(root, "bin"); const token = join(root, "token"); const candidates = join(root, "candidates.json");
    try {
      mkdirSync(bin); writeFileSync(token, "SYNTHETIC_REAL_DEBRID_TOKEN_DO_NOT_LEAK"); writeFileSync(candidates, "[]");
      for (const [name, source] of [["chown", "#!/bin/sh\nexit 0\n"], ["chmod", "#!/bin/sh\nexit 0\n"], ["stat", "#!/bin/sh\ncase \"$*\" in *%a*) case \"$*\" in *override*) echo 600;; *) echo 600;; esac;; *%u*|*%g*) echo 1000;; esac\n"]] as const) { const file = join(bin, name); writeFileSync(file, source); chmodSync(file, 0o700); }
      const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "sh";
      const shellBin = process.platform === "win32" ? `/${bin.replaceAll("\\", "/").charAt(0).toLowerCase()}${bin.replaceAll("\\", "/").slice(2)}` : bin;
      const result = spawnSync(shell, ["-c", process.platform === "win32" ? 'chown(){ "$FAKE_BIN/chown" "$@";}; chmod(){ "$FAKE_BIN/chmod" "$@";}; stat(){ "$FAKE_BIN/stat" "$@";}; . lab/real-debrid-addon-runtime/scripts/real-client-access.sh' : ". lab/real-debrid-addon-runtime/scripts/real-client-access.sh"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, PATH: `${shellBin}:/usr/bin:/bin`, FAKE_BIN: shellBin, EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_TOKEN_FILE: token, EXPERIMENTAL_ADDON_CANDIDATES_FILE: candidates, EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: "tt0000001" } });
      assert.equal(result.status, 2); assert.equal(result.signal, null); assert.equal(result.stderr, ""); assert.equal(result.stdout, "TOKEN_FILE_INVALID\n");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  for (const [label, uid, gid] of [["UID", "999", "1000"], ["GID", "1000", "999"]] as const) {
    it(`rejects an ephemeral token with invalid ${label}`, () => {
      const root = mkdtempSync(join(tmpdir(), "mibr-token-owner-")); const bin = join(root, "bin"); const token = join(root, "token"); const candidates = join(root, "candidates.json");
      try {
        mkdirSync(bin); writeFileSync(token, "SYNTHETIC_REAL_DEBRID_TOKEN_DO_NOT_LEAK"); writeFileSync(candidates, "[]");
        for (const [name, source] of [["chown", "#!/bin/sh\nexit 0\n"], ["chmod", "#!/bin/sh\nexit 0\n"], ["stat", `#!/bin/sh\ncase \"$*\" in *%a*) echo 400;; *%u*) echo ${uid};; *%g*) echo ${gid};; esac\n`]] as const) { const file = join(bin, name); writeFileSync(file, source); chmodSync(file, 0o700); }
        const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "sh"; const shellBin = process.platform === "win32" ? `/${bin.replaceAll("\\", "/").charAt(0).toLowerCase()}${bin.replaceAll("\\", "/").slice(2)}` : bin;
        const result = spawnSync(shell, ["-c", process.platform === "win32" ? 'chown(){ "$FAKE_BIN/chown" "$@";}; chmod(){ "$FAKE_BIN/chmod" "$@";}; stat(){ "$FAKE_BIN/stat" "$@";}; . lab/real-debrid-addon-runtime/scripts/real-client-access.sh' : ". lab/real-debrid-addon-runtime/scripts/real-client-access.sh"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, PATH: `${shellBin}:/usr/bin:/bin`, FAKE_BIN: shellBin, EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_TOKEN_FILE: token, EXPERIMENTAL_ADDON_CANDIDATES_FILE: candidates, EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: "tt0000001" } });
        assert.equal(result.status, 2); assert.equal(result.signal, null); assert.equal(result.stderr, ""); assert.equal(result.stdout, "TOKEN_FILE_INVALID\n");
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
  it("rejects missing token source before Compose", () => {
    const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "sh";
    const result = spawnSync(shell, ["-c", ". lab/real-debrid-addon-runtime/scripts/real-client-access.sh"], {
      cwd: process.cwd(), encoding: "utf8", env: {
        ...process.env,
        EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true",
        EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true",
        EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true",
        EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: "tt0000001",
      },
    });
    assert.equal(result.status, 2);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "TOKEN_FILE_INVALID\n");
    assert.doesNotMatch(result.stdout, /CLIENT_ACCESS_READY|REAL_DEBRID_MODE_ENABLED|Authorization|magnet/i);
  });

  it("rejects a nonexistent token source before Compose", () => {
    const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "sh";
    const result = spawnSync(shell, ["-c", ". lab/real-debrid-addon-runtime/scripts/real-client-access.sh"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_TOKEN_FILE: "missing-synthetic-token", EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: "tt0000001" } });
    assert.equal(result.status, 2); assert.equal(result.signal, null); assert.equal(result.stderr, ""); assert.equal(result.stdout, "TOKEN_FILE_INVALID\n");
  });

  it("rejects a symlink token source before Compose", (context) => {
    const root = mkdtempSync(join(tmpdir(), "mibr-token-link-")); const target = join(root, "target"); const link = join(root, "link");
    try {
      writeFileSync(target, "SYNTHETIC_REAL_DEBRID_TOKEN_DO_NOT_LEAK");
      try { symlinkSync(target, link); } catch { context.skip("runner cannot create a controlled symlink"); return; }
      const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "sh";
      const result = spawnSync(shell, ["-c", ". lab/real-debrid-addon-runtime/scripts/real-client-access.sh"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_TOKEN_FILE: link, EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: "tt0000001" } });
      assert.equal(result.status, 2); assert.equal(result.signal, null); assert.equal(result.stderr, ""); assert.equal(result.stdout, "TOKEN_FILE_INVALID\n");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  for (const [label, content] of [["empty", ""], ["whitespace", " \t\n"]] as const) {
    it(`rejects a regular ${label} token source before Compose`, () => {
      const root = mkdtempSync(join(tmpdir(), "mibr-token-empty-"));
      const token = join(root, "token"); const candidates = join(root, "candidates.json");
      try {
        writeFileSync(token, content);
        writeFileSync(candidates, "[]");
        const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "sh";
        const result = spawnSync(shell, ["-c", ". lab/real-debrid-addon-runtime/scripts/real-client-access.sh"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_TOKEN_FILE: token, EXPERIMENTAL_ADDON_CANDIDATES_FILE: candidates, EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: "tt0000001" } });
        assert.equal(result.status, 2); assert.equal(result.signal, null); assert.equal(result.stderr, ""); assert.equal(result.stdout, "TOKEN_FILE_INVALID\n");
        assert.doesNotMatch(result.stdout, /CLIENT_ACCESS_READY|REAL_DEBRID_MODE_ENABLED|Authorization|magnet/i);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }

  for (const missing of [
    "EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED",
    "EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED",
    "EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED",
  ] as const) {
    it(`fails closed before Compose when ${missing} is absent`, () => {
      const environment = {
        ...process.env,
        EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true",
        EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true",
        EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true",
        EXPERIMENTAL_ADDON_REAL_DEBRID_TOKEN_FILE: "SYNTHETIC_REAL_DEBRID_TOKEN_DO_NOT_LEAK",
        EXPERIMENTAL_ADDON_CANDIDATES_FILE: "SYNTHETIC_CANDIDATES_DO_NOT_LEAK",
      };
      delete environment[missing];
      const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "sh";
      const result = spawnSync(shell, ["-c", ". lab/real-debrid-addon-runtime/scripts/real-client-access.sh"], {
        cwd: process.cwd(), encoding: "utf8", env: environment,
      });
      assert.equal(result.status, 2);
      assert.equal(result.signal, null);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout, "CONFIGURATION_INVALID\n");
      assert.doesNotMatch(result.stdout, /CLIENT_ACCESS_READY|REAL_DEBRID_MODE_ENABLED|SYNTHETIC|magnet|Authorization/i);
    });
  }

  for (const authorization of [
    "EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED",
    "EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED",
    "EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED",
  ] as const) for (const value of ["", " ", "false", "1", "TRUE", "yes"]) {
    it(`fails closed before Compose when ${authorization} is ${JSON.stringify(value)}`, () => {
      const environment = {
        ...process.env,
        EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true",
        EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true",
        EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true",
        EXPERIMENTAL_ADDON_REAL_DEBRID_TOKEN_FILE: "SYNTHETIC_REAL_DEBRID_TOKEN_DO_NOT_LEAK",
        EXPERIMENTAL_ADDON_CANDIDATES_FILE: "SYNTHETIC_CANDIDATES_DO_NOT_LEAK",
        [authorization]: value,
      };
      const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "sh";
      const result = spawnSync(shell, ["-c", ". lab/real-debrid-addon-runtime/scripts/real-client-access.sh"], {
        cwd: process.cwd(), encoding: "utf8", env: environment,
      });
      assert.equal(result.status, 2);
      assert.equal(result.signal, null);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout, "CONFIGURATION_INVALID\n");
      assert.doesNotMatch(result.stdout, /CLIENT_ACCESS_READY|REAL_DEBRID_MODE_ENABLED|SYNTHETIC|magnet|safe\/video|Authorization/i);
    });
  }

  it("does not read a token while disabled and fails closed without exact authorizations", () => {
    assert.deepEqual(createExperimentalRealDebridClientMode({ EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "false", REAL_DEBRID_TOKEN_FILE: "missing" }), { enabled: false, authorizedImdbIds: [], candidates: [] });
    for (const value of [undefined, "", "1", " true", "TRUE"]) {
      assert.throws(() => createExperimentalRealDebridClientMode({ EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: value, EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true" }), ExperimentalRealDebridClientModeError);
    }
  });

  it("accepts only an owned, mode 0400 non-empty token file and a small exact allowlist", () => {
    const directory = mkdtempSync(join(tmpdir(), "mibr-real-mode-"));
    const token = join(directory, "token");
    try {
      writeFileSync(token, "synthetic-token"); chmodSync(token, 0o400);
      try { chownSync(token, 1000, 1000); } catch { /* Windows CI has no POSIX ownership */ }
      const env = { EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true", EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true", EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true", REAL_DEBRID_TOKEN_FILE: token, EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: "tt0111161" };
      if (process.platform !== "win32") assert.deepEqual(createExperimentalRealDebridClientMode(env).authorizedImdbIds, ["tt0111161"]);
      assert.throws(() => createExperimentalRealDebridClientMode({ ...env, EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: "tt0111161,*" }), ExperimentalRealDebridClientModeError);
      symlinkSync(token, join(directory, "link"));
      assert.throws(() => createExperimentalRealDebridClientMode({ ...env, REAL_DEBRID_TOKEN_FILE: join(directory, "link") }), ExperimentalRealDebridClientModeError);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("runs the real client launcher once in authorized LOOPBACK mode using only local fakes", () => {
    const root = mkdtempSync(join(tmpdir(), "mibr-real-launcher-"));
    const bin = join(root, "bin"); const events = join(root, "events"); const token = join(root, "token"); const candidates = join(root, "candidates.json");
    const hash = "a".repeat(40); const magnet = `magnet:?xt=urn:btih:${hash}`;
    const fake = (name: string, source: string) => { const path = join(bin, name); writeFileSync(path, source); chmodSync(path, 0o700); };
    try {
      mkdirSync(bin); writeFileSync(token, "SYNTHETIC_REAL_DEBRID_TOKEN_DO_NOT_LEAK"); writeFileSync(candidates, JSON.stringify([{ imdbId: "tt0000001", type: "movie", magnet, infoHash: hash, filePath: "safe/video.mkv", fileBytes: 1 }]));
      fake("cp", "#!/bin/sh\n/usr/bin/cp \"$@\"\n");
      fake("chown", "#!/bin/sh\nexit 0\n");
      fake("chmod", "#!/bin/sh\nexit 0\n");
      fake("stat", "#!/bin/sh\ncase \"$*\" in *%a*) case \"$*\" in *override*) echo 600;; *) echo 400;; esac;; *%u*|*%g*) echo 1000;; *) exit 1;; esac\n");
      fake("ss", "#!/bin/sh\nexit 0\n"); fake("ip", "#!/bin/sh\nexit 0\n"); fake("sleep", "#!/bin/sh\nexit 0\n");
      fake("docker", "#!/bin/sh\ncase \"$*\" in *' config'*) echo COMPOSE_CONFIG >> \"$FAKE_EVENTS\";; *' up '*) echo COMPOSE_UP >> \"$FAKE_EVENTS\";; *' down '*) echo COMPOSE_DOWN >> \"$FAKE_EVENTS\";; esac\nexit 0\n");
      fake("curl", "#!/bin/sh\nh= b=; while [ $# -gt 0 ]; do case \"$1\" in --dump-header) h=$2; shift 2;; --output) b=$2; shift 2;; --write-out|--proto|--connect-timeout|--max-time|--max-redirs|--request) shift 2;; *) shift;; esac; done; printf 'HTTP/1.1 200 OK\\r\\nContent-Type: application/json\\r\\n\\r\\n' > \"$h\"; printf '{}' > \"$b\"; n=$(cat \"$FAKE_EVENTS\" 2>/dev/null | wc -l); [ \"$n\" -eq 2 ] && echo HEALTH_VALIDATED >> \"$FAKE_EVENTS\" || echo MANIFEST_VALIDATED >> \"$FAKE_EVENTS\"; printf '200\\napplication/json\\n'\n");
      const shell = process.platform === "win32"
        ? "C:\\Program Files\\Git\\bin\\bash.exe"
        : "sh";

      const toShellPath = (value: string): string => {
        if (process.platform !== "win32") return value;
        const normalized = value.replaceAll("\\", "/");
        return `/${normalized.charAt(0).toLowerCase()}${normalized.slice(2)}`;
      };

      const shellToken = toShellPath(token);
      const shellCandidates = toShellPath(candidates);

      const fakePath = process.platform === "win32"
        ? `${toShellPath(bin)}:/usr/bin:/bin`
        : `${bin}:${process.env.PATH ?? ""}`;

      const launcherScript = process.platform === "win32"
        ? [
            'cp() { "$FAKE_BIN/cp" "$@"; }',
            'chown() { "$FAKE_BIN/chown" "$@"; }',
            'chmod() { "$FAKE_BIN/chmod" "$@"; }',
            'stat() { "$FAKE_BIN/stat" "$@"; }',
            'docker() { "$FAKE_BIN/docker" "$@"; }',
            'curl() { "$FAKE_BIN/curl" "$@"; }',
            'ss() { "$FAKE_BIN/ss" "$@"; }',
            'sleep() { "$FAKE_BIN/sleep" "$@"; }',
            'ip() { "$FAKE_BIN/ip" "$@"; }',
            '. lab/real-debrid-addon-runtime/scripts/real-client-access.sh',
          ].join("\n")
        : "exec sh lab/real-debrid-addon-runtime/scripts/real-client-access.sh";

      const result = spawnSync(
        shell,
        process.platform === "win32"
          ? ["-c", launcherScript]
          : ["-c", launcherScript],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: fakePath,
            FAKE_BIN: toShellPath(bin),
            FAKE_EVENTS: toShellPath(events),
            EXPERIMENTAL_ADDON_CLIENT_ACCESS_AUTHORIZED: "true",
            EXPERIMENTAL_ADDON_REAL_DEBRID_ENABLED: "true",
            EXPERIMENTAL_ADDON_REAL_DEBRID_AUTHORIZED: "true",
            EXPERIMENTAL_ADDON_CLIENT_ACCESS_MODE: "LOOPBACK",
            EXPERIMENTAL_ADDON_CLIENT_ACCESS_HOST: "127.0.0.1",
            EXPERIMENTAL_ADDON_CLIENT_ACCESS_PORT: "17007",
            EXPERIMENTAL_ADDON_CLIENT_ACCESS_TIMEOUT_SECONDS: "1",
            EXPERIMENTAL_ADDON_AUTHORIZED_IMDB_IDS: "tt0000001",
            EXPERIMENTAL_ADDON_REAL_DEBRID_TOKEN_FILE: shellToken,
            EXPERIMENTAL_ADDON_CANDIDATES_FILE: shellCandidates,
          },
        }
      );
      assert.equal(result.status, 0);
      assert.match(
        result.stdout,
        /CLIENT_ACCESS_READY[\s\S]*REAL_DEBRID_MODE_ENABLED/
      );
      assert.doesNotMatch(
        result.stdout,
        /SYNTHETIC|magnet|safe\/video|Authorization/i
      );
      assert.deepEqual(readFileSync(events, "utf8").trim().split("\n"), ["COMPOSE_CONFIG", "COMPOSE_UP", "HEALTH_VALIDATED", "MANIFEST_VALIDATED", "COMPOSE_DOWN"]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
