import { readFile, rm } from "node:fs/promises";
import { TorrentIndexerParser } from "../../src/providers/torrentIndexer/torrentIndexerParser.js";

export const AUTHORIZED_TERM = "Big Buck Bunny";
export const AUTHORIZED_INDEXER = "bludv";
export const CONTRACT_LIMIT = 1;
export const CONTRACT_TIMEOUT_SECONDS = 20;
export const CONTRACT_MAX_RESPONSE_BYTES = 1_048_576;

export type RuntimeContractStatus = "VALIDATED_WITH_RESULTS" | "PARTIAL_ZERO_RESULTS";

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
