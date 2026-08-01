export const PUBLIC_INSTANCE_BASE_URL = "https://torrent-indexer.darklyn.org";
export const PROBE_TERM = "Big Buck Bunny";
export const PROBE_TIMEOUT_MS = 20_000;
export const PROBE_MAX_RESPONSE_BYTES = 1_048_576;

export const ALLOWED_INDEXERS = [
  "comando_torrents",
  "bludv",
  "torrent-dos-filmes",
  "rede_torrent",
  "vaca_torrent",
  "starck-filmes",
] as const;

export type PublicProbeIndexer = (typeof ALLOWED_INDEXERS)[number];
export type ProbeCategory = "OK_RESULT" | "OK_ZERO_RESULTS" | "HTTP_ERROR" | "TIMEOUT" | "INVALID_JSON" | "RESPONSE_TOO_LARGE";

export interface PublicProbeReport {
  indexer: PublicProbeIndexer;
  http: number | null;
  durationMs: number;
  responseBytes: number;
  validJson: "SIM" | "NÃO";
  count: number | null;
  indexedCount: number | null;
  resultCount: number | null;
  category: ProbeCategory;
}

export function parseAllowedIndexer(value: unknown): PublicProbeIndexer {
  if (typeof value !== "string" || !ALLOWED_INDEXERS.includes(value as PublicProbeIndexer)) {
    throw new Error(`indexer must be exactly one of: ${ALLOWED_INDEXERS.join(", ")}`);
  }
  return value as PublicProbeIndexer;
}

export function buildPublicProbeUrl(indexer: PublicProbeIndexer): string {
  const url = new URL(`/indexers/${encodeURIComponent(indexer)}`, PUBLIC_INSTANCE_BASE_URL);
  url.searchParams.set("q", PROBE_TERM);
  url.searchParams.set("filter_results", "true");
  url.searchParams.set("limit", "1");
  return url.toString();
}

function optionalNonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

export function summarizePublicProbeResponse(
  indexer: PublicProbeIndexer,
  http: number,
  durationMs: number,
  responseBytes: number,
  body: string,
): PublicProbeReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return { indexer, http, durationMs, responseBytes, validJson: "NÃO", count: null, indexedCount: null, resultCount: null, category: http >= 200 && http <= 299 ? "INVALID_JSON" : "HTTP_ERROR" };
  }

  const root = typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  const results = Array.isArray(root.results) ? root.results : null;
  return {
    indexer,
    http,
    durationMs,
    responseBytes,
    validJson: "SIM",
    count: optionalNonNegativeInteger(root.count),
    indexedCount: optionalNonNegativeInteger(root.indexed_count),
    resultCount: results?.length ?? null,
    category: http < 200 || http > 299 ? "HTTP_ERROR" : results === null ? "INVALID_JSON" : results.length > 0 ? "OK_RESULT" : "OK_ZERO_RESULTS",
  };
}

class ResponseTooLargeError extends Error {
  constructor(readonly observedBytes: number) {
    super("response exceeded 1 MiB");
    this.name = "ResponseTooLargeError";
  }
}

async function readLimitedResponse(
  response: Response,
  onBytesObserved: (bytes: number) => void,
): Promise<{ body: string; bytes: number }> {
  if (!response.body) return { body: "", bytes: 0 };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    onBytesObserved(bytes);
    if (bytes > PROBE_MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ResponseTooLargeError(bytes);
    }
    chunks.push(chunk.value);
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return { body: new TextDecoder().decode(merged), bytes };
}

export async function runPublicProbe(
  indexerValue: unknown,
  fetchImplementation: typeof fetch = fetch,
  timeoutSignal: AbortSignal = AbortSignal.timeout(PROBE_TIMEOUT_MS),
): Promise<PublicProbeReport> {
  const indexer = parseAllowedIndexer(indexerValue);
  const startedAt = performance.now();
  let http: number | null = null;
  let observedBytes = 0;
  try {
    const response = await fetchImplementation(buildPublicProbeUrl(indexer), {
      signal: timeoutSignal,
      redirect: "error",
      headers: { accept: "application/json", "user-agent": "mibr-addons-contract-probe/0.0.1" },
    });
    http = response.status;
    const { body, bytes } = await readLimitedResponse(response, (value) => { observedBytes = value; });
    return summarizePublicProbeResponse(indexer, response.status, Math.round(performance.now() - startedAt), bytes, body);
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    if (error instanceof ResponseTooLargeError) {
      return { indexer, http, durationMs, responseBytes: error.observedBytes, validJson: "NÃO", count: null, indexedCount: null, resultCount: null, category: "RESPONSE_TOO_LARGE" };
    }
    const timeoutReason = timeoutSignal.reason;
    if (timeoutSignal.aborted && timeoutReason instanceof DOMException && timeoutReason.name === "TimeoutError") {
      return { indexer, http, durationMs, responseBytes: observedBytes, validJson: "NÃO", count: null, indexedCount: null, resultCount: null, category: "TIMEOUT" };
    }
    return { indexer, http, durationMs, responseBytes: observedBytes, validJson: "NÃO", count: null, indexedCount: null, resultCount: null, category: "HTTP_ERROR" };
  }
}
