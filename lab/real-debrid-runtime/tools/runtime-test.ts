import { performance } from "node:perf_hooks";
import { constants } from "node:fs";
import { access, lstat, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  REAL_DEBRID_API_BASE_URL,
  RealDebridResolverError,
  type RealDebridTransportRequest,
} from "../../../src/providers/torrentIndexer/realDebridApiClient.js";
import { RealDebridFetchTransport } from "../../../src/providers/torrentIndexer/realDebridFetchTransport.js";
import { RealDebridApiClient } from "../../../src/providers/torrentIndexer/realDebridApiClient.js";
import { RealDebridCandidateResolver } from "../../../src/providers/torrentIndexer/realDebridCandidateResolver.js";
import type { RealDebridTorrentInfo } from "../../../src/providers/torrentIndexer/realDebridApiClient.js";
import { buildFailureReport, CandidateDiagnosticTracker, CandidatePollingDiagnosticTracker, candidateRuntimeCategory, CandidateStageTracker, opaqueCategory, RuntimeValidationError, validateToken } from "./runtime-lab-support.js";

type ExitCode = 0 | 1 | 2;
type SafeScalar = string | number | boolean;
type SafeReport = Readonly<Record<string, SafeScalar | readonly string[]>>;

const SAFE_ACCOUNT_TYPES = new Set(["free", "premium"]);

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new RealDebridResolverError("invalid_configuration");
  return value;
}

function category(error: unknown): string {
  return opaqueCategory(error instanceof RealDebridResolverError || error instanceof RuntimeValidationError ? error.code : undefined);
}

export interface RuntimeTokenFileAccess {
  lstat(path: string): Promise<{ isFile(): boolean; size: number; mode: number; uid: number; gid: number }>;
  access(path: string): Promise<void>;
  readFile(path: string): Promise<string>;
}

const runtimeTokenFileAccess: RuntimeTokenFileAccess = {
  lstat,
  access: async (path) => access(path, constants.R_OK),
  readFile: async (path) => readFile(path, "utf8"),
};

export async function loadRuntimeToken(tokenFile: string | undefined, fileAccess: RuntimeTokenFileAccess = runtimeTokenFileAccess): Promise<string> {
  if (tokenFile === undefined || tokenFile.length === 0) throw new RuntimeValidationError("INVALID_CONFIGURATION");
  let metadata: Awaited<ReturnType<RuntimeTokenFileAccess["lstat"]>>;
  try { metadata = await fileAccess.lstat(tokenFile); }
  catch (error) { throw new RuntimeValidationError((error as { code?: string }).code === "ENOENT" ? "TOKEN_FILE_MISSING" : "TOKEN_FILE_UNREADABLE"); }
  const mode = metadata.mode & 0o777;
  if (!metadata.isFile() || metadata.uid !== 1_000 || metadata.gid !== 1_000 || (mode !== 0o400 && mode !== 0o600)) throw new RuntimeValidationError("TOKEN_FILE_INVALID_PERMISSIONS");
  if (metadata.size < 1) throw new RuntimeValidationError("TOKEN_FILE_EMPTY");
  try { await fileAccess.access(tokenFile); }
  catch { throw new RuntimeValidationError("TOKEN_FILE_UNREADABLE"); }
  let token: string;
  try { token = await fileAccess.readFile(tokenFile); }
  catch { throw new RuntimeValidationError("TOKEN_FILE_UNREADABLE"); }
  if (token.length === 0) throw new RuntimeValidationError("TOKEN_FILE_EMPTY");
  try { return validateToken(token); }
  catch { throw new RuntimeValidationError("INVALID_CONFIGURATION"); }
}

export function sanitizeAccountPayload(decoded: unknown, http: number, durationMs: number): SafeReport {
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) throw new RealDebridResolverError("invalid_response");
  const value = decoded as Record<string, unknown>;
  const rawType = typeof value.type === "string" ? value.type.toLowerCase() : "unknown";
  return Object.freeze({
    authenticated: "SIM",
    accountType: SAFE_ACCOUNT_TYPES.has(rawType) ? rawType : "other",
    expirationPresent: typeof value.expiration === "string" && value.expiration.length > 0 ? "SIM" : "NÃO",
    premiumPresent: typeof value.premium === "number" || typeof value.premium === "boolean" ? "SIM" : "NÃO",
    HTTP: http,
    durationMs,
    category: "SUCCESS",
  });
}

function emit(report: SafeReport): void {
  process.stdout.write(`${JSON.stringify(Object.freeze({ ...report }))}\n`);
}

function accountRequest(token: string, signal: AbortSignal): RealDebridTransportRequest {
  return Object.freeze({
    baseUrl: REAL_DEBRID_API_BASE_URL,
    method: "GET",
    pathname: "/user",
    redirect: "error",
    headers: Object.freeze({ Authorization: `Bearer ${token}` }),
    signal,
  });
}

async function account(token: string): Promise<ExitCode> {
  const started = performance.now();
  try {
    // ACCOUNT_REQUEST_ONCE: exactly one HTTP request; no automatic repetition.
    const response = await new RealDebridFetchTransport({ timeoutMs: 20_000 }).request(accountRequest(token, AbortSignal.timeout(20_000)));
    if (response.status < 200 || response.status >= 300) {
      emit({ authenticated: "NÃO", accountType: "unknown", expirationPresent: "NÃO", premiumPresent: "NÃO", HTTP: response.status, durationMs: Math.round(performance.now() - started), category: response.status === 401 || response.status === 403 ? "AUTHENTICATION_FAILED" : "HTTP_ERROR" });
      return 1;
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.contentType)) throw new RealDebridResolverError("invalid_content_type");
    let decoded: unknown;
    try { decoded = JSON.parse(response.bodyText) as unknown; }
    catch { throw new RealDebridResolverError("invalid_json"); }
    emit(sanitizeAccountPayload(decoded, response.status, Math.round(performance.now() - started)));
    return 0;
  } catch (error) {
    emit(buildFailureReport("account", error instanceof RealDebridResolverError ? error.code : undefined, Math.round(performance.now() - started)));
    return error instanceof RealDebridResolverError && error.code === "invalid_response" ? 2 : 1;
  }
}

async function candidate(token: string): Promise<ExitCode> {
  const started = performance.now();
  if (process.env.REAL_DEBRID_CANDIDATE_AUTHORIZED !== "true") throw new RealDebridResolverError("invalid_configuration");
  const magnet = required("REAL_DEBRID_CANDIDATE_MAGNET");
  const infoHash = required("REAL_DEBRID_CANDIDATE_INFO_HASH");
  const path = required("REAL_DEBRID_CANDIDATE_FILE_PATH");
  const bytes = Number(required("REAL_DEBRID_CANDIDATE_FILE_BYTES"));
  if (!/^[a-fA-F0-9]{40}$/.test(infoHash) || !Number.isSafeInteger(bytes) || bytes < 0) throw new RealDebridResolverError("invalid_configuration");
  const stages = new CandidateStageTracker();
  const diagnostics = new CandidateDiagnosticTracker();
  const polling = new CandidatePollingDiagnosticTracker();
  let postSelect = false;
  class TrackingApiClient extends RealDebridApiClient {
    override async addMagnet(value: string, signal: AbortSignal): Promise<string> {
      const id = await super.addMagnet(value, signal); stages.complete("authenticated"); stages.complete("magnet_added"); return id;
    }
    override async info(id: string, signal: AbortSignal): Promise<RealDebridTorrentInfo> {
      if (postSelect) polling.startAttempt();
      try {
        const info = await super.info(id, signal); diagnostics.recordInfo(info, path, bytes);
        if (postSelect) polling.recordStatus(info.status);
        if (info.status === "downloaded") stages.complete("downloaded"); return info;
      } catch (error) {
        const code = error instanceof RealDebridResolverError ? error.code : "transport_error";
        diagnostics.recordError(code);
        const classified = candidateRuntimeCategory(code, "info").toLowerCase() as typeof code;
        if (classified !== code) throw new RealDebridResolverError(classified);
        throw error;
      }
    }
    override async selectFile(id: string, fileId: number, signal: AbortSignal): Promise<void> {
      await super.selectFile(id, fileId, signal); stages.complete("file_selected"); postSelect = true;
    }
    override async unrestrict(link: string, signal: AbortSignal): Promise<string> {
      const url = await super.unrestrict(link, signal); stages.complete("link_unrestricted"); return url;
    }
    override async delete(id: string, signal: AbortSignal): Promise<void> {
      stages.complete("cleanup_attempted"); await super.delete(id, signal); stages.complete("cleanup_completed");
    }
  }
  const pollDelay = (signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => { signal.removeEventListener("abort", onAbort); resolve(); };
    const onAbort = () => { if (timer !== undefined) clearTimeout(timer); signal.removeEventListener("abort", onAbort); reject(new RealDebridResolverError("canceled")); };
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(finish, 1_500);
  });
  const resolver = new RealDebridCandidateResolver(new TrackingApiClient(new RealDebridFetchTransport({ timeoutMs: 20_000 }), token),
    { pollAttempts: 20, totalTimeoutMs: 45_000, delay: pollDelay });
  try {
    // CANDIDATE_RESOLUTION_ONCE: one resolver chain; POST/DELETE are not repeated.
    const result = await resolver.resolve(Object.freeze({
      infoHash: infoHash.toLowerCase(), magnet,
      files: Object.freeze([Object.freeze({ path, sizeBytes: bytes })]),
      media: Object.freeze({ type: "movie" as const, id: "authorized-runtime-input" }),
      signal: new AbortController().signal,
    }));
    if (result !== null) stages.complete("final_url_validated");
    emit({ status: result === null ? "PARTIAL" : "SUCCESS", stagesCompleted: stages.snapshot(), durationMs: Math.round(performance.now() - started), finalUrlValid: result === null ? "NÃO" : "SIM", cleanup: stages.snapshot().includes("cleanup_completed") ? "SIM" : "NÃO", category: result === null ? "NO_RESOLUTION" : "SUCCESS" });
    return result === null ? 2 : 0;
  } catch (error) {
    const rawCode = error instanceof RealDebridResolverError ? error.code : undefined;
    polling.recordFailure(rawCode);
    const runtimeCode = candidateRuntimeCategory(rawCode, "workflow");
    emit(Object.freeze({ ...buildFailureReport("candidate", runtimeCode, Math.round(performance.now() - started)), stagesCompleted: stages.snapshot(), cleanup: stages.snapshot().includes("cleanup_completed") ? "SIM" : "NÃO", ...diagnostics.snapshot(), ...polling.snapshot() }));
    return 1;
  }
}

async function main(): Promise<ExitCode> {
  if (process.env.REAL_DEBRID_AUTHORIZED !== "true") throw new RealDebridResolverError("invalid_configuration");
  const token = await loadRuntimeToken(process.env.REAL_DEBRID_TOKEN_FILE);
  const mode = process.env.REAL_DEBRID_TEST_MODE ?? "account";
  if (mode === "account") return account(token);
  if (mode === "candidate") return candidate(token);
  throw new RealDebridResolverError("invalid_configuration");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    emit(buildFailureReport("account", category(error), 0));
    process.exitCode = 1;
  });
}
