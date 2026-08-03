export type RuntimeMode = "account" | "candidate";
export type RuntimeExitCode = 0 | 1 | 2 | 130 | 143 | 148;

export interface RuntimeCandidateInput {
  readonly magnet: string;
  readonly infoHash: string;
  readonly path: string;
  readonly bytes: number;
}

export interface RuntimeConfiguration {
  readonly mode: RuntimeMode;
  readonly token: string;
  readonly candidate?: RuntimeCandidateInput;
}

export class RuntimeValidationError extends Error {
  constructor(readonly code: "ENV_MISSING" | "NOT_AUTHORIZED" | "TOKEN_INVALID" | "MODE_INVALID" | "CANDIDATE_NOT_AUTHORIZED" | "CANDIDATE_INPUT_INVALID" | "PERMISSIONS_UNSAFE") {
    super(`Runtime configuration rejected (${code})`);
    this.name = "RuntimeValidationError";
  }
}

export function validateToken(token: string | undefined): string {
  if (token === undefined || token.length < 1 || token.length > 4_096 || token.trim().length === 0 || /[\r\n\u0000]/.test(token)) throw new RuntimeValidationError("TOKEN_INVALID");
  return token;
}

export function validatePosixMode(mode: number | undefined): void {
  if (mode === undefined || (mode & 0o077) !== 0) throw new RuntimeValidationError("PERMISSIONS_UNSAFE");
}

export function validateRuntimeConfiguration(values: Readonly<Record<string, string | undefined>>, envPresent = true): RuntimeConfiguration {
  if (!envPresent) throw new RuntimeValidationError("ENV_MISSING");
  if (values.REAL_DEBRID_AUTHORIZED !== "true") throw new RuntimeValidationError("NOT_AUTHORIZED");
  const token = validateToken(values.REAL_DEBRID_API_TOKEN);
  const mode = values.REAL_DEBRID_TEST_MODE ?? "account";
  if (mode !== "account" && mode !== "candidate") throw new RuntimeValidationError("MODE_INVALID");
  if (mode === "account") return Object.freeze({ mode, token });
  if (values.REAL_DEBRID_CANDIDATE_AUTHORIZED !== "true") throw new RuntimeValidationError("CANDIDATE_NOT_AUTHORIZED");
  const magnet = values.REAL_DEBRID_CANDIDATE_MAGNET;
  const infoHash = values.REAL_DEBRID_CANDIDATE_INFO_HASH;
  const path = values.REAL_DEBRID_CANDIDATE_FILE_PATH;
  const rawBytes = values.REAL_DEBRID_CANDIDATE_FILE_BYTES;
  const bytes = Number(rawBytes);
  if (magnet === undefined || magnet.length === 0 || infoHash === undefined || !/^[a-fA-F0-9]{40}$/.test(infoHash)
    || path === undefined || path.length === 0 || rawBytes === undefined || rawBytes.length === 0
    || !Number.isSafeInteger(bytes) || bytes < 0) throw new RuntimeValidationError("CANDIDATE_INPUT_INVALID");
  return Object.freeze({ mode, token, candidate: Object.freeze({ magnet, infoHash: infoHash.toLowerCase(), path, bytes }) });
}

const ERROR_CATEGORIES = new Set(["INVALID_CONFIGURATION", "CANCELED", "TIMEOUT", "TRANSPORT_ERROR", "UNEXPECTED_HTTP_STATUS", "RATE_LIMITED", "INVALID_CONTENT_TYPE", "INVALID_JSON", "RESPONSE_TOO_LARGE", "INVALID_RESPONSE", "UNKNOWN_STATUS", "TERMINAL_STATUS", "FILE_NOT_FOUND", "AMBIGUOUS_FILE_SELECTION", "LINK_NOT_FOUND", "AMBIGUOUS_LINK", "INVALID_FINAL_URL", "CLEANUP_FAILED"]);

export function opaqueCategory(code: string | undefined): string {
  const normalized = code?.toUpperCase() ?? "UNKNOWN";
  return ERROR_CATEGORIES.has(normalized) ? normalized : "UNKNOWN";
}

export function buildFailureReport(mode: RuntimeMode, code: string | undefined, durationMs: number): Readonly<Record<string, string | number | readonly string[]>> {
  if (mode === "account") return Object.freeze({ authenticated: "NÃO", accountType: "unknown", expirationPresent: "NÃO", premiumPresent: "NÃO", HTTP: 0, durationMs, category: opaqueCategory(code) });
  return Object.freeze({ status: "FAILED", stagesCompleted: Object.freeze([]), durationMs, finalUrlValid: "NÃO", cleanup: "NÃO", category: opaqueCategory(code) });
}

export function onceAsync(operation: () => Promise<void>): () => Promise<void> {
  let invoked = false;
  return async () => { if (invoked) return; invoked = true; await operation(); };
}

export async function runOfflineLifecycle(operation: () => Promise<RuntimeExitCode>, cleanupOperation: () => Promise<void>): Promise<RuntimeExitCode> {
  const cleanup = onceAsync(cleanupOperation);
  let code: RuntimeExitCode = 1;
  try { code = await operation(); }
  catch (error) { if (error instanceof RuntimeLifecycleExit) code = error.exitCode; }
  finally { try { await cleanup(); } catch { /* Cleanup is best-effort and cannot replace the primary code. */ } }
  return code;
}

export class RuntimeLifecycleExit extends Error {
  constructor(readonly exitCode: RuntimeExitCode) { super("Runtime lifecycle interrupted"); }
}

export const CANDIDATE_STAGES = Object.freeze(["authenticated", "magnet_added", "file_selected", "downloaded", "link_unrestricted", "final_url_validated", "cleanup_attempted", "cleanup_completed"] as const);
export type CandidateStage = typeof CANDIDATE_STAGES[number];

export class CandidateStageTracker {
  private readonly completed: CandidateStage[] = [];
  complete(stage: CandidateStage): void { if (!this.completed.includes(stage)) this.completed.push(stage); }
  snapshot(): readonly CandidateStage[] { return Object.freeze([...this.completed]); }
}
