import { readFile, rm } from "node:fs/promises";
import { TorrentIndexerParser } from "../../src/providers/torrentIndexer/torrentIndexerParser.js";

export const AUTHORIZED_TERM = "Big Buck Bunny";
export const AUTHORIZED_INDEXER = "bludv";
export const CONTRACT_LIMIT = 1;
export const CONTRACT_TIMEOUT_SECONDS = 20;
export const CONTRACT_MAX_RESPONSE_BYTES = 1_048_576;

export type RuntimeContractStatus = "VALIDATED_WITH_RESULTS" | "PARTIAL_ZERO_RESULTS";
export type DiagnosticCategory = "FLARESOLVERR" | "DNS_NETWORK" | "EXTERNAL_HTTP" | "TIMEOUT" |
  "PARSER_SCRAPER" | "REDIS" | "CONFIGURATION" | "UNKNOWN";

const ALLOWED_ERROR_KEYS = new Set(["error", "message", "status", "code", "type"]);
const OPAQUE_ERROR_MESSAGE = "upstream returned an opaque error payload.";

const SENSITIVE_FIELDS = new Set([
  "title",
  "original_title",
  "details",
  "magnet_link",
  "info_hash",
  "trackers",
  "files",
  "url",
]);

export interface RuntimeContractConfig {
  authorizationConfirmed: boolean;
  indexer: string;
  term: string;
  limit: number;
  timeoutSeconds: number;
  maxResponseBytes: number;
}

export interface RuntimeContractReport {
  status: RuntimeContractStatus;
  count: number | null;
  indexedCount: number | null;
  resultCount: number;
  acceptedByParser: number;
  rejectedByParser: number;
  rootKeys: string[];
  resultKeys: string[];
  observedTypes: Record<string, string[]>;
  emptyValueCount: number;
  sensitiveFieldsOmitted: string[];
}

export interface SanitizedDiagnosticLine {
  category: DiagnosticCategory;
  message: string;
}

export interface SanitizedErrorDiagnostic {
  payloadFormat: "JSON" | "TEXT";
  allowedRootKeys: string[];
  message: string;
  logErrors: SanitizedDiagnosticLine[];
  environmentPresence: Record<string, "PRESENT" | "ABSENT">;
  dns: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  egress: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isEmpty(value: unknown): boolean {
  return value === null || (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0);
}

function optionalCount(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

export function classifyDiagnostic(input: string): DiagnosticCategory {
  const value = input.toLowerCase();
  if (/flare\s*solverr|flaresolverr/.test(value)) return "FLARESOLVERR";
  if (/dns|no such host|name resolution|network unreachable|connection refused/.test(value)) return "DNS_NETWORK";
  if (/timeout|timed out|deadline exceeded/.test(value)) return "TIMEOUT";
  if (/redis/.test(value)) return "REDIS";
  if (/parse|parser|scrap|selector|html|document/.test(value)) return "PARSER_SCRAPER";
  if (/config|configuration|missing env|environment variable|not configured/.test(value)) return "CONFIGURATION";
  if (/http|status code|bad gateway|service unavailable|upstream/.test(value)) return "EXTERNAL_HTTP";
  return "UNKNOWN";
}

export function sanitizeDiagnosticMessage(input: unknown): string {
  if (typeof input !== "string" || input.trim() === "") return OPAQUE_ERROR_MESSAGE;
  let value = input
    .replace(/magnet:\?[^\s"']+/gi, "[redacted-magnet]")
    .replace(/(?:https?|udp):\/\/[^\s"']+/gi, "[redacted-url]")
    .replace(/\b[a-f0-9]{40,64}\b/gi, "[redacted-hash]")
    .replace(/\bq=[^\s&"']+(?:%20|\+|[^\s&"'])*/gi, "[redacted-query]")
    .replace(/big(?:%20|\+|\s)+buck(?:%20|\+|\s)+bunny/gi, "[redacted-query]")
    .replace(/\b(?:title|original_title|tracker|filename|files?)\s*[:=]\s*[^,;\]}]+/gi, "[redacted-field]")
    .replace(/\b[^\s/\\]+\.(?:torrent|mp4|mkv|avi|webm|srt)\b/gi, "[redacted-file]")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length > 200) value = value.slice(0, 200);
  if (/magnet:|(?:https?|udp):\/\/|\b[a-f0-9]{40,64}\b|big(?:%20|\+|\s)+buck/i.test(value)) {
    return OPAQUE_ERROR_MESSAGE;
  }
  return value || OPAQUE_ERROR_MESSAGE;
}

function extractErrorPayload(body: string): Pick<SanitizedErrorDiagnostic, "payloadFormat" | "allowedRootKeys" | "message"> {
  try {
    const parsed = JSON.parse(body) as unknown;
    const root = isObject(parsed) ? parsed : {};
    const allowedRootKeys = Object.keys(root).filter((key) => ALLOWED_ERROR_KEYS.has(key)).sort();
    const candidate = [root.message, root.error, root.code, root.status].find((value) => typeof value === "string");
    return { payloadFormat: "JSON", allowedRootKeys, message: sanitizeDiagnosticMessage(candidate) };
  } catch {
    return { payloadFormat: "TEXT", allowedRootKeys: [], message: sanitizeDiagnosticMessage(body) };
  }
}

function extractLogErrors(logs: string): SanitizedDiagnosticLine[] {
  const output: SanitizedDiagnosticLine[] = [];
  for (const line of logs.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    let level = "";
    let candidate = line;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isObject(parsed)) {
        level = typeof parsed.level === "string" ? parsed.level : "";
        candidate = [parsed.message, parsed.msg, parsed.error].find((value) => typeof value === "string") as string | undefined ?? "";
      }
    } catch {
      level = /\b(fatal|error)\b/i.exec(line)?.[1] ?? "";
    }
    if (!/^(error|fatal)$/i.test(level)) continue;
    const message = sanitizeDiagnosticMessage(candidate);
    output.push({ category: classifyDiagnostic(candidate), message });
    if (output.length === 20) break;
  }
  return output;
}

function parsePresence(input: string): Record<string, "PRESENT" | "ABSENT"> {
  const result: Record<string, "PRESENT" | "ABSENT"> = {};
  for (const line of input.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]+)=(PRESENT|ABSENT)$/.exec(line.trim());
    const name = match?.[1];
    const status = match?.[2];
    if (name !== undefined && (status === "PRESENT" || status === "ABSENT")) result[name] = status;
  }
  return result;
}

function parseCheck(input: string): "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN" {
  const value = input.trim();
  return value === "AVAILABLE" || value === "UNAVAILABLE" ? value : "UNKNOWN";
}

export function createSanitizedErrorDiagnostic(body: string, logs: string, environment: string, dns: string, egress: string): SanitizedErrorDiagnostic {
  return {
    ...extractErrorPayload(body),
    logErrors: extractLogErrors(logs),
    environmentPresence: parsePresence(environment),
    dns: parseCheck(dns),
    egress: parseCheck(egress),
  };
}

export async function diagnoseAndDeleteTemporaryFiles(paths: {
  body: string; logs: string; environment: string; dns: string; egress: string;
}): Promise<SanitizedErrorDiagnostic> {
  try {
    const [body, logs, environment, dns, egress] = await Promise.all([
      readFile(paths.body, "utf8"), readFile(paths.logs, "utf8"), readFile(paths.environment, "utf8"),
      readFile(paths.dns, "utf8"), readFile(paths.egress, "utf8"),
    ]);
    return createSanitizedErrorDiagnostic(body, logs, environment, dns, egress);
  } finally {
    await Promise.all(Object.values(paths).map((path) => rm(path, { force: true })));
  }
}

export function validateRuntimeContractConfig(config: RuntimeContractConfig): void {
  if (!config.authorizationConfirmed) {
    throw new Error("Explicit authorization confirmation is required");
  }
  if (config.term !== AUTHORIZED_TERM) {
    throw new Error(`Only the authorized term ${AUTHORIZED_TERM} is permitted`);
  }
  if (config.indexer !== AUTHORIZED_INDEXER) {
    throw new Error(`Only the reviewed indexer ${AUTHORIZED_INDEXER} is permitted`);
  }
  if (config.limit !== CONTRACT_LIMIT) {
    throw new Error(`The result limit must be exactly ${CONTRACT_LIMIT}`);
  }
  if (config.timeoutSeconds !== CONTRACT_TIMEOUT_SECONDS) {
    throw new Error(`Timeout must be exactly ${CONTRACT_TIMEOUT_SECONDS} seconds`);
  }
  if (config.maxResponseBytes !== CONTRACT_MAX_RESPONSE_BYTES) {
    throw new Error(`Maximum response size must be exactly ${CONTRACT_MAX_RESPONSE_BYTES} bytes`);
  }
}

export function parseRuntimeInteger(value: string | undefined, name: string): number {
  if (value === undefined || !/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  return Number(value);
}

export function assertResponseSize(responseBytes: number): void {
  if (!Number.isInteger(responseBytes) || responseBytes < 0 || responseBytes > CONTRACT_MAX_RESPONSE_BYTES) {
    throw new Error(`Response exceeds the fixed ${CONTRACT_MAX_RESPONSE_BYTES}-byte limit`);
  }
}

export function createRuntimeContractReport(input: unknown): RuntimeContractReport {
  const root = isObject(input) ? input : {};
  const results = Array.isArray(root.results) ? root.results : [];
  const objects = results.filter(isObject);
  const resultKeys = [...new Set(objects.flatMap((item) => Object.keys(item)))].sort();
  const observedTypes: Record<string, string[]> = {};
  let emptyValueCount = 0;

  for (const key of resultKeys) {
    const types = new Set<string>();
    for (const item of objects) {
      if (!Object.hasOwn(item, key)) continue;
      const value = item[key];
      types.add(valueType(value));
      if (isEmpty(value)) emptyValueCount += 1;
    }
    observedTypes[key] = [...types].sort();
  }

  const acceptedByParser = new TorrentIndexerParser().parse(input).items.length;
  return {
    status: results.length === 0 ? "PARTIAL_ZERO_RESULTS" : "VALIDATED_WITH_RESULTS",
    count: optionalCount(root.count),
    indexedCount: optionalCount(root.indexed_count),
    resultCount: results.length,
    acceptedByParser,
    rejectedByParser: Math.max(0, results.length - acceptedByParser),
    rootKeys: Object.keys(root).sort(),
    resultKeys,
    observedTypes,
    emptyValueCount,
    sensitiveFieldsOmitted: resultKeys.filter((key) => SENSITIVE_FIELDS.has(key)),
  };
}

export async function analyzeAndDeleteRawResponse(path: string): Promise<RuntimeContractReport> {
  try {
    const input = JSON.parse(await readFile(path, "utf8")) as unknown;
    return createRuntimeContractReport(input);
  } finally {
    await rm(path, { force: true });
  }
}
