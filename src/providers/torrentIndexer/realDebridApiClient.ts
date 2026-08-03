export const REAL_DEBRID_API_BASE_URL = "https://api.real-debrid.com/rest/1.0" as const;

export type RealDebridErrorCode =
  | "invalid_configuration" | "canceled" | "timeout" | "transport_error"
  | "unexpected_http_status" | "rate_limited" | "invalid_content_type" | "invalid_json"
  | "response_too_large" | "invalid_response" | "unknown_status"
  | "info_http_error" | "info_invalid_json" | "info_invalid_response"
  | "file_list_missing" | "file_list_invalid" | "file_list_too_many" | "file_id_invalid"
  | "authorized_file_not_found" | "authorized_file_size_mismatch" | "ambiguous_authorized_file"
  | "terminal_status" | "file_not_found" | "ambiguous_file_selection"
  | "link_not_found" | "ambiguous_link" | "invalid_final_url" | "cleanup_failed";

export class RealDebridResolverError extends Error {
  constructor(readonly code: RealDebridErrorCode) {
    super(`Real-Debrid resolver failed (${code})`);
    this.name = "RealDebridResolverError";
  }
}

export function errorFromSignal(signal: AbortSignal): RealDebridResolverError {
  return new RealDebridResolverError(
    signal.reason instanceof DOMException && signal.reason.name === "TimeoutError" ? "timeout" : "canceled",
  );
}

/** Consumes late resolution/rejection and gives an AbortSignal priority. */
export async function raceAgainstSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw errorFromSignal(signal);
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(errorFromSignal(signal)));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

export type RealDebridMethod = "GET" | "POST" | "DELETE";
export type RealDebridFormBody = Readonly<Record<string, string>>;

export interface RealDebridTransportRequest {
  readonly baseUrl: typeof REAL_DEBRID_API_BASE_URL;
  readonly method: RealDebridMethod;
  readonly pathname: string;
  readonly redirect: "error";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: RealDebridFormBody;
  readonly signal: AbortSignal;
}

export interface RealDebridTransportResponse {
  readonly status: number;
  readonly contentType: string;
  readonly bodyText: string;
}

export interface RealDebridHttpTransport {
  request(request: RealDebridTransportRequest): Promise<RealDebridTransportResponse>;
}

export interface RealDebridFile {
  readonly id: number;
  readonly path: string;
  readonly bytes: number;
  readonly selected: boolean;
}

export type RealDebridStatus = "magnet_conversion" | "waiting_files_selection" | "queued"
  | "downloading" | "downloaded" | "magnet_error" | "error" | "virus" | "dead";

export interface RealDebridTorrentInfo {
  readonly id: string;
  readonly status: RealDebridStatus;
  readonly files: readonly RealDebridFile[];
  readonly links: readonly string[];
}

const MAX_BODY_BYTES = 1_048_576;
const MAX_ID_LENGTH = 200;
const MAX_ITEMS = 100;
const MAX_TEXT = 8_192;
export const MAX_FILE_BYTES = 10 * 1_024 ** 4;
const STATUS = new Set<RealDebridStatus>([
  "magnet_conversion", "waiting_files_selection", "queued", "downloading", "downloaded",
  "magnet_error", "error", "virus", "dead",
]);

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function id(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH
    && /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

function limitedString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT ? value : null;
}

export function isSafeRealDebridPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_024
    || value !== value.trim() || value.startsWith("/") || value.includes("\\") || value.includes("%")
    || /[\u0000-\u001f\u007f∕⁄＼]/u.test(value) || /^[a-z]:/i.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== ".."
    && segment.length <= 255 && !segment.endsWith(".") && !segment.endsWith(" "));
}

function decodeFiles(value: unknown): readonly RealDebridFile[] {
  if (value === undefined) throw new RealDebridResolverError("file_list_missing");
  if (!Array.isArray(value)) throw new RealDebridResolverError("file_list_invalid");
  if (value.length > MAX_ITEMS) throw new RealDebridResolverError("file_list_too_many");
  const files: RealDebridFile[] = [];
  for (const entry of value) {
    const item = object(entry);
    if (item === null) throw new RealDebridResolverError("file_list_invalid");
    if (!Number.isSafeInteger(item.id) || (item.id as number) <= 0) throw new RealDebridResolverError("file_id_invalid");
    if (!isSafeRealDebridPath(item.path)
      || !Number.isSafeInteger(item.bytes) || (item.bytes as number) < 0 || (item.bytes as number) > MAX_FILE_BYTES
      || typeof item.selected !== "number" || (item.selected !== 0 && item.selected !== 1)) {
      throw new RealDebridResolverError("file_list_invalid");
    }
    files.push(Object.freeze({ id: item.id as number, path: item.path, bytes: item.bytes as number, selected: item.selected === 1 }));
  }
  return Object.freeze(files);
}

function decodeLinks(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const links = value.map(limitedString);
  return links.some((link) => link === null) ? null : Object.freeze(links as string[]);
}

export class RealDebridApiClient {
  constructor(private readonly transport: RealDebridHttpTransport, private readonly token: string) {
    if (token.length === 0 || token.length > 4_096 || /[\u0000-\u001f\u007f]/.test(token)) {
      throw new RealDebridResolverError("invalid_configuration");
    }
  }

  private async call(method: RealDebridMethod, pathname: string, signal: AbortSignal, body?: RealDebridFormBody): Promise<unknown> {
    if (signal.aborted) throw errorFromSignal(signal);
    const headers = Object.freeze({
      Authorization: `Bearer ${this.token}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    });
    const operation = Promise.resolve().then(() => this.transport.request(Object.freeze({
      baseUrl: REAL_DEBRID_API_BASE_URL, method, pathname, redirect: "error" as const, headers,
      ...(body === undefined ? {} : { body: Object.freeze({ ...body }) }), signal,
    }))).catch((error: unknown) => {
      if (error instanceof RealDebridResolverError) throw error;
      throw new RealDebridResolverError("transport_error");
    });
    const response = await raceAgainstSignal(operation, signal);
    if (signal.aborted) throw errorFromSignal(signal);
    if (new TextEncoder().encode(response.bodyText).byteLength > MAX_BODY_BYTES) throw new RealDebridResolverError("response_too_large");
    if (response.status === 429) throw new RealDebridResolverError("rate_limited");
    if (response.status < 200 || response.status >= 300) throw new RealDebridResolverError("unexpected_http_status");
    if (response.status === 204 && response.bodyText === "") return null;
    if (!/^application\/json(?:\s*;|$)/i.test(response.contentType)) throw new RealDebridResolverError("invalid_content_type");
    if (response.bodyText === "") throw new RealDebridResolverError("invalid_json");
    try { return JSON.parse(response.bodyText) as unknown; }
    catch { throw new RealDebridResolverError("invalid_json"); }
  }

  async addMagnet(magnet: string, signal: AbortSignal): Promise<string> {
    const value = object(await this.call("POST", "/torrents/addMagnet", signal, { magnet }));
    const torrentId = id(value?.id);
    if (torrentId === null) throw new RealDebridResolverError("invalid_response");
    return torrentId;
  }

  async info(torrentId: string, signal: AbortSignal): Promise<RealDebridTorrentInfo> {
    const value = object(await this.call("GET", `/torrents/info/${encodeURIComponent(torrentId)}`, signal));
    const decodedId = id(value?.id);
    const files = decodeFiles(value?.files);
    const links = decodeLinks(value?.links);
    const status = value?.status;
    if (typeof status === "string" && !STATUS.has(status as RealDebridStatus)) throw new RealDebridResolverError("unknown_status");
    if (decodedId === null || decodedId !== torrentId || links === null || typeof status !== "string") {
      throw new RealDebridResolverError("invalid_response");
    }
    return Object.freeze({ id: decodedId, status: status as RealDebridStatus, files, links });
  }

  async selectFile(torrentId: string, fileId: number, signal: AbortSignal): Promise<void> {
    await this.call("POST", `/torrents/selectFiles/${encodeURIComponent(torrentId)}`, signal, { files: String(fileId) });
  }

  async unrestrict(link: string, signal: AbortSignal): Promise<string> {
    const value = object(await this.call("POST", "/unrestrict/link", signal, { link }));
    const download = limitedString(value?.download);
    if (download === null) throw new RealDebridResolverError("invalid_response");
    return download;
  }

  async delete(torrentId: string, signal: AbortSignal): Promise<void> {
    await this.call("DELETE", `/torrents/delete/${encodeURIComponent(torrentId)}`, signal);
  }
}
