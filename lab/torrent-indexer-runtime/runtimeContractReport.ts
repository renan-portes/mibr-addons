import { readFile, rm } from "node:fs/promises";
import { TorrentIndexerParser } from "../../src/providers/torrentIndexer/torrentIndexerParser.js";

export const AUTHORIZED_TERM = "Big Buck Bunny";
export const AUTHORIZED_INDEXER = "bludv";
export const CONTRACT_LIMIT = 1;
export const CONTRACT_TIMEOUT_SECONDS = 20;
export const CONTRACT_MAX_RESPONSE_BYTES = 1_048_576;

export type RuntimeContractStatus = "VALIDATED_WITH_RESULTS" | "PARTIAL_ZERO_RESULTS";
export type DiagnosticCategory = "FLARESOLVERR" | "FLARESOLVERR_CHALLENGE_UNRESOLVED" |
  "DNS_NETWORK" | "EXTERNAL_HTTP" | "TIMEOUT" |
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
  category: DiagnosticCategory;
  message: string;
  logErrors: SanitizedDiagnosticLine[];
  correlatedEvents: SanitizedRuntimeEvent[];
  environmentPresence: Record<string, "PRESENT" | "ABSENT">;
  dns: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  egress: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
}

export interface SanitizedRuntimeEvent {
  service: "TORRENT_INDEXER" | "FLARESOLVERR";
  stage: "SESSION" | "INTERNAL_HTTP" | "CHALLENGE";
  result: "SUCCESS" | "FAILURE" | "OBSERVED";
  statusHttp: number | null;
  durationMs: number | null;
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
  if (/response is a chall(?:a|e)nge|challenge (?:remained |was )?unresolved/.test(value)) {
    return "FLARESOLVERR_CHALLENGE_UNRESOLVED";
  }
  if (/unsupported protocol scheme/.test(value)) return "CONFIGURATION";
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
    .replace(/<[^>]*>/g, "[redacted-html]")
    .replace(/\b(?:cookie|set-cookie|authorization|headers?|user-agent)\s*[:=]\s*[^,;\]}]+/gi, "[redacted-field]")
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

function extractErrorPayload(body: string): Pick<SanitizedErrorDiagnostic, "payloadFormat" | "allowedRootKeys" | "category" | "message"> {
  try {
    const parsed = JSON.parse(body) as unknown;
    const root = isObject(parsed) ? parsed : {};
    const allowedRootKeys = Object.keys(root).filter((key) => ALLOWED_ERROR_KEYS.has(key)).sort();
    const candidate = [root.message, root.error, root.code, root.status].find((value) => typeof value === "string");
    const message = sanitizeDiagnosticMessage(candidate);
    return { payloadFormat: "JSON", allowedRootKeys, category: classifyDiagnostic(message), message };
  } catch {
    const message = sanitizeDiagnosticMessage(body);
    return { payloadFormat: "TEXT", allowedRootKeys: [], category: classifyDiagnostic(message), message };
  }
}

function extractLogErrors(logs: string, marker?: string): SanitizedDiagnosticLine[] {
  const output: SanitizedDiagnosticLine[] = [];
  const markerMs = marker === undefined ? null : Date.parse(marker);
  for (const line of logs.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const contentWithTimestamp = line.replace(/^[^|\r\n]+\|\s*/, "");
    const timestamp = /^(\d{4}-\d\d-\d\dT\S+)/.exec(contentWithTimestamp)?.[1];
    const timestampMs = timestamp === undefined ? Number.NaN : Date.parse(timestamp);
    if (markerMs !== null && Number.isFinite(markerMs) &&
      (!Number.isFinite(timestampMs) || timestampMs < markerMs)) continue;
    const content = contentWithTimestamp.replace(/^\d{4}-\d\d-\d\dT\S+\s*/, "");
    let level = "";
    let classificationSource = content;
    try {
      const parsed = JSON.parse(content) as unknown;
      if (isObject(parsed)) {
        level = typeof parsed.level === "string" ? parsed.level : "";
        classificationSource = JSON.stringify(parsed);
      }
    } catch {
      level = /\b(fatal|error)\b/i.exec(content)?.[1] ?? "";
    }
    if (!/^(error|fatal)$/i.test(level)) continue;
    const category = classifyDiagnostic(classificationSource);
    output.push({ category, message: normalizedDiagnosticMessage(category) });
    if (output.length === 20) break;
  }
  return output;
}

function normalizedDiagnosticMessage(category: DiagnosticCategory): string {
  const messages: Record<DiagnosticCategory, string> = {
    FLARESOLVERR: "A FlareSolverr operation failed.",
    FLARESOLVERR_CHALLENGE_UNRESOLVED: "The challenge remained unresolved after the FlareSolverr request path.",
    DNS_NETWORK: "DNS or network connectivity failed.",
    EXTERNAL_HTTP: "An external HTTP request failed.",
    TIMEOUT: "An upstream operation timed out.",
    PARSER_SCRAPER: "Parser or scraper processing failed.",
    REDIS: "Redis operation failed.",
    CONFIGURATION: "Required runtime configuration is missing or invalid.",
    UNKNOWN: "An unclassified upstream error occurred.",
  };
  return messages[category];
}

function eventDurationMs(line: string): number | null {
  const match = /\b(?:duration|elapsed|response in)\D{0,8}(\d+(?:\.\d+)?)\s*(ms|s|seconds?)\b/i.exec(line);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const value = Number(match[1]);
  return match[2].toLowerCase() === "ms" ? Math.round(value) : Math.round(value * 1000);
}

function internalHttpStatus(line: string): number | null {
  const match = /(?:status(?:code)?\D{0,8}|\bPOST\s+\/v1\b[^\r\n]{0,80}?\b)([1-5]\d\d)\b/i.exec(line);
  return match?.[1] === undefined ? null : Number(match[1]);
}

export function correlateRuntimeLogs(
  torrentIndexerLogs: string,
  flaresolverrLogs: string,
  marker: string,
): SanitizedRuntimeEvent[] {
  const markerMs = Date.parse(marker);
  if (!Number.isFinite(markerMs)) return [];
  const events: SanitizedRuntimeEvent[] = [];

  const inspect = (logs: string, service: SanitizedRuntimeEvent["service"]): void => {
    const pendingDurations: number[] = [];
    const pendingStatuses: number[] = [];
    for (const rawLine of logs.split(/\r?\n/)) {
      const line = rawLine.replace(/^[^|\r\n]+\|\s*/, "");
      const timestamp = /^(\d{4}-\d\d-\d\dT\S+)/.exec(line)?.[1];
      const timestampMs = timestamp === undefined ? Number.NaN : Date.parse(timestamp);
      if (!Number.isFinite(timestampMs) || timestampMs < markerMs) continue;
      const durationMs = eventDurationMs(line);
      const status = internalHttpStatus(line);
      let event: SanitizedRuntimeEvent | undefined;

      if (/failed to create flaresolverr session/i.test(line)) {
        event = { service, stage: "SESSION", result: "FAILURE", statusHttp: status, durationMs };
      } else if (/created new flaresolverr session/i.test(line)) {
        event = { service, stage: "SESSION", result: "SUCCESS", statusHttp: status, durationMs };
      } else if (/incoming request\s*=>\s*post\s+\/v1\b/i.test(line)) {
        event = { service, stage: "INTERNAL_HTTP", result: "OBSERVED", statusHttp: status, durationMs: null };
      } else if (/response is a chall(?:a|e)nge|error solving the challenge|challenge.*(?:failed|unresolved)/i.test(line)) {
        event = { service, stage: "CHALLENGE", result: "FAILURE", statusHttp: status, durationMs };
      } else if (/challenge solved|challenge.*success/i.test(line)) {
        event = { service, stage: "CHALLENGE", result: "SUCCESS", statusHttp: status, durationMs };
      } else if (/\bresponse in\s+\d/i.test(line)) {
        const requestIndex = pendingDurations.shift();
        if (requestIndex !== undefined && durationMs !== null) {
          events[requestIndex]!.durationMs = durationMs;
        }
        continue;
      } else if (/\/v1|request served from flaresolverr|flaresolverr internal server error/i.test(line)) {
        const result = status === null ? "OBSERVED" : status >= 400 ? "FAILURE" : "SUCCESS";
        const requestIndex = pendingStatuses.shift();
        if (requestIndex !== undefined && /\/v1/.test(line) && status !== null) {
          events[requestIndex]!.statusHttp = status;
          events[requestIndex]!.result = result;
          continue;
        }
        event = { service, stage: "INTERNAL_HTTP", result, statusHttp: status, durationMs };
      }

      if (event !== undefined) {
        events.push(event);
        if (event.stage === "INTERNAL_HTTP" && /incoming request/i.test(line)) {
          pendingDurations.push(events.length - 1);
          pendingStatuses.push(events.length - 1);
        }
      }
      if (events.length === 40) return;
    }
  };

  inspect(torrentIndexerLogs, "TORRENT_INDEXER");
  inspect(flaresolverrLogs, "FLARESOLVERR");
  return events;
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

export function createSanitizedErrorDiagnostic(
  body: string,
  logs: string,
  environment: string,
  dns: string,
  egress: string,
  correlation?: { torrentIndexerLogs: string; flaresolverrLogs: string; marker: string },
): SanitizedErrorDiagnostic {
  return {
    ...extractErrorPayload(body),
    logErrors: extractLogErrors(logs, correlation?.marker),
    correlatedEvents: correlation === undefined ? [] : correlateRuntimeLogs(
      correlation.torrentIndexerLogs,
      correlation.flaresolverrLogs,
      correlation.marker,
    ),
    environmentPresence: parsePresence(environment),
    dns: parseCheck(dns),
    egress: parseCheck(egress),
  };
}

export async function diagnoseAndDeleteTemporaryFiles(paths: {
  body: string; logs: string; environment: string; dns: string; egress: string;
  torrentIndexerLogs?: string; flaresolverrLogs?: string; marker?: string;
}): Promise<SanitizedErrorDiagnostic> {
  try {
    const [body, logs, environment, dns, egress, torrentIndexerLogs, flaresolverrLogs, marker] = await Promise.all([
      readFile(paths.body, "utf8"), readFile(paths.logs, "utf8"), readFile(paths.environment, "utf8"),
      readFile(paths.dns, "utf8"), readFile(paths.egress, "utf8"),
      paths.torrentIndexerLogs === undefined ? "" : readFile(paths.torrentIndexerLogs, "utf8"),
      paths.flaresolverrLogs === undefined ? "" : readFile(paths.flaresolverrLogs, "utf8"),
      paths.marker === undefined ? "" : readFile(paths.marker, "utf8"),
    ]);
    const correlation = paths.torrentIndexerLogs === undefined || paths.flaresolverrLogs === undefined || paths.marker === undefined
      ? undefined
      : { torrentIndexerLogs, flaresolverrLogs, marker };
    return createSanitizedErrorDiagnostic(body, logs, environment, dns, egress, correlation);
  } finally {
    await Promise.all(Object.values(paths).filter((path): path is string => path !== undefined).map((path) => rm(path, { force: true })));
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
