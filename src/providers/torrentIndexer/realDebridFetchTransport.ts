import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  REAL_DEBRID_API_BASE_URL,
  RealDebridResolverError,
  errorFromSignal,
  raceAgainstSignal,
  type RealDebridHttpTransport,
  type RealDebridTransportRequest,
  type RealDebridTransportResponse,
} from "./realDebridApiClient.js";

const MAX_RESPONSE_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;
const READER_CANCEL_TIMEOUT_MS = 250;
const MAX_PATHNAME_LENGTH = 512;

export type RealDebridDnsLookup = (hostname: string) => Promise<readonly string[]>;
export type RealDebridFetch = (input: string, init: RequestInit) => Promise<Response>;
export interface RealDebridTransportClock {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RealDebridFetchTransportOptions {
  readonly timeoutMs?: number;
  readonly fetch?: RealDebridFetch;
  readonly lookup?: RealDebridDnsLookup;
  readonly clock?: RealDebridTransportClock;
}

const systemClock: RealDebridTransportClock = {
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function ipv4Parts(address: string): readonly number[] | null {
  if (isIP(address) !== 4) return null;
  const parts = address.split(".").map(Number);
  return parts.length === 4 ? parts : null;
}

function isForbiddenIpv4(address: string): boolean {
  const parts = ipv4Parts(address);
  if (parts === null) return true;
  const [a = -1, b = -1, c = -1] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0) || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function ipv6BigInt(address: string): bigint | null {
  const plain = address.split("%")[0]?.toLowerCase() ?? "";
  if (isIP(plain) !== 6) return null;
  let source = plain;
  const dotted = source.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted !== null) {
    const parts = ipv4Parts(dotted[2]!);
    if (parts === null) return null;
    source = `${dotted[1]}${((parts[0]! << 8) | parts[1]!).toString(16)}:${((parts[2]! << 8) | parts[3]!).toString(16)}`;
  }
  const halves = source.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] === "" ? [] : halves[0]!.split(":");
  const right = halves.length === 1 || halves[1] === "" ? [] : halves[1]!.split(":");
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

function hasPrefix(value: bigint, prefix: bigint, bits: number): boolean {
  return bits === 0 || (value >> BigInt(128 - bits)) === (prefix >> BigInt(128 - bits));
}

function embeddedIpv4(value: bigint, prefix: bigint): string | null {
  if (!hasPrefix(value, prefix, 96)) return null;
  const tail = Number(value & 0xffff_ffffn);
  return `${tail >>> 24}.${(tail >>> 16) & 255}.${(tail >>> 8) & 255}.${tail & 255}`;
}

export function isPublicRealDebridAddress(address: string): boolean {
  const version = isIP(address.split("%")[0] ?? "");
  if (version === 4) return !isForbiddenIpv4(address);
  if (version !== 6) return false;
  const value = ipv6BigInt(address);
  if (value === null) return false;
  const ipv4Mapped = embeddedIpv4(value, 0x00000000000000000000ffff00000000n);
  if (ipv4Mapped !== null) return !isForbiddenIpv4(ipv4Mapped);
  const nat64 = embeddedIpv4(value, 0x0064ff9b000000000000000000000000n);
  if (nat64 !== null) return !isForbiddenIpv4(nat64);
  return value !== 0n && value !== 1n
    && !hasPrefix(value, 0x01000000000000000000000000000000n, 64)
    && !hasPrefix(value, 0x20010db8000000000000000000000000n, 32)
    && !hasPrefix(value, 0x20010010000000000000000000000000n, 28)
    && !hasPrefix(value, 0xfc000000000000000000000000000000n, 7)
    && !hasPrefix(value, 0xfe800000000000000000000000000000n, 10)
    && !hasPrefix(value, 0xff000000000000000000000000000000n, 8);
}

async function systemLookup(hostname: string): Promise<readonly string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function encodeBody(body: Readonly<Record<string, string>> | undefined): string | undefined {
  if (body === undefined) return undefined;
  const encoded = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) encoded.set(key, value);
  return encoded.toString();
}

function isAllowedPathname(pathname: string): boolean {
  if (pathname.length === 0 || pathname.length > MAX_PATHNAME_LENGTH || !pathname.startsWith("/")
    || pathname.startsWith("//") || pathname.includes("\\") || pathname.includes("%")
    || pathname.includes("?") || pathname.includes("#") || /[\u0000-\u001f\u007f]/.test(pathname)) return false;
  const segments = pathname.slice(1).split("/");
  if (segments.some((segment) => segment.length === 0 || segment.length > 200 || segment === "." || segment === "..")) return false;
  return pathname === "/user" || pathname === "/torrents/addMagnet" || pathname === "/unrestrict/link"
    || /^\/torrents\/(?:info|selectFiles|delete)\/[A-Za-z0-9_-]{1,200}$/.test(pathname);
}

async function cancelReaderBestEffort(reader: ReadableStreamDefaultReader<Uint8Array>, clock: RealDebridTransportClock): Promise<void> {
  const cancelOperation = Promise.resolve().then(() => reader.cancel()).catch(() => undefined);
  let handle: unknown;
  const limit = new Promise<void>((resolve) => { handle = clock.setTimeout(resolve, READER_CANCEL_TIMEOUT_MS); });
  try { await Promise.race([cancelOperation, limit]); }
  finally { clock.clearTimeout(handle); }
}

async function readLimited(response: Response, signal: AbortSignal, clock: RealDebridTransportClock): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    throw new RealDebridResolverError("response_too_large");
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await raceAgainstSignal(reader.read(), signal);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new RealDebridResolverError("response_too_large");
      chunks.push(next.value);
    }
  } finally {
    await cancelReaderBestEffort(reader, clock);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export class RealDebridFetchTransport implements RealDebridHttpTransport {
  private readonly timeoutMs: number;
  private readonly fetchImpl: RealDebridFetch;
  private readonly lookupImpl: RealDebridDnsLookup;
  private readonly clock: RealDebridTransportClock;

  constructor(options: RealDebridFetchTransportOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > MAX_TIMEOUT_MS) {
      throw new RealDebridResolverError("invalid_configuration");
    }
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.lookupImpl = options.lookup ?? systemLookup;
    this.clock = options.clock ?? systemClock;
  }

  async request(request: RealDebridTransportRequest): Promise<RealDebridTransportResponse> {
    if (request.baseUrl !== REAL_DEBRID_API_BASE_URL || request.redirect !== "error" || !isAllowedPathname(request.pathname)) {
      throw new RealDebridResolverError("invalid_configuration");
    }
    if (request.signal.aborted) throw errorFromSignal(request.signal);
    const controller = new AbortController();
    const onAbort = () => controller.abort(request.signal.reason);
    request.signal.addEventListener("abort", onAbort, { once: true });
    const timer = this.clock.setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), this.timeoutMs);
    try {
      const hostname = new URL(REAL_DEBRID_API_BASE_URL).hostname;
      const addresses = await raceAgainstSignal(Promise.resolve().then(() => this.lookupImpl(hostname)), controller.signal);
      if (addresses.length === 0 || addresses.some((address) => !isPublicRealDebridAddress(address))) {
        throw new RealDebridResolverError("transport_error");
      }
      if (controller.signal.aborted) throw errorFromSignal(controller.signal);
      const url = `${REAL_DEBRID_API_BASE_URL}${request.pathname}`;
      const response = await raceAgainstSignal(Promise.resolve().then(() => this.fetchImpl(url, {
        method: request.method,
        headers: { ...request.headers },
        body: encodeBody(request.body),
        redirect: "error",
        signal: controller.signal,
      })), controller.signal);
      if (controller.signal.aborted) throw errorFromSignal(controller.signal);
      const bodyText = await readLimited(response, controller.signal, this.clock);
      await Promise.resolve();
      if (request.signal.aborted) throw errorFromSignal(request.signal);
      if (controller.signal.aborted) throw errorFromSignal(controller.signal);
      return Object.freeze({
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        bodyText,
      });
    } catch (error) {
      if (error instanceof RealDebridResolverError) throw error;
      if (controller.signal.aborted) throw errorFromSignal(controller.signal);
      throw new RealDebridResolverError("transport_error");
    } finally {
      this.clock.clearTimeout(timer);
      request.signal.removeEventListener("abort", onAbort);
    }
  }
}
