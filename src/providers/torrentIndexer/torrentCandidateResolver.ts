import type { MediaType } from "../../types/mediaType.js";

export interface TorrentCandidateFile {
  readonly path: string;
  readonly sizeBytes?: number;
}

export interface TorrentCandidateMediaContext {
  readonly id: string;
  readonly type: MediaType;
}

export interface TorrentCandidateResolutionRequest {
  readonly infoHash: string;
  readonly magnet?: string;
  readonly files: readonly TorrentCandidateFile[];
  readonly media: TorrentCandidateMediaContext;
  readonly signal: AbortSignal;
}

export type TorrentCandidateResolutionSource = "authorized-resolver" | "local-test";

export interface ResolvedTorrentCandidate {
  readonly url: string;
  readonly name?: string;
  readonly sizeBytes?: number;
  readonly source: TorrentCandidateResolutionSource;
  readonly expiresAt?: string;
  /** Every followed redirect, in order, including the final URL. */
  readonly redirectChain?: readonly string[];
}

export interface TorrentCandidateResolver {
  resolve(request: TorrentCandidateResolutionRequest): Promise<ResolvedTorrentCandidate | null>;
}

const INFO_HASH_PATTERN = /^[a-f0-9]{40}$/;
const MAX_NAME_LENGTH = 200;
const MAX_URL_LENGTH = 8_192;
const MAX_REDIRECTS = 10;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIpv4(hostname: string): readonly number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^(?:0|[1-9]\d{0,2})$/.test(part) ? Number(part) : -1));
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

function isBlockedIpv4(octets: readonly number[]): boolean {
  const [a = -1, b = -1, c = -1] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (normalized === "") return true;
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;

  const ipv4 = parseIpv4(normalized);
  if (ipv4 !== null) return isBlockedIpv4(ipv4);

  if (!normalized.includes(":")) return false;
  if (normalized === "::" || normalized === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true;
  // URL canonicalization may rewrite dotted IPv4-mapped addresses to hex.
  // Reject the mapped range entirely to avoid bypassing the IPv4 policy.
  if (normalized.startsWith("::ffff:")) return true;
  return false;
}

function validatePlaybackUrl(value: unknown): string | null {
  if (typeof value !== "string"
    || value.length === 0
    || value.length > MAX_URL_LENGTH
    || CONTROL_CHARACTER_PATTERN.test(value)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const rawAuthority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i.exec(value)?.[1];
  const rawHostWithPort = rawAuthority?.slice((rawAuthority.lastIndexOf("@") ?? -1) + 1);
  const rawHost = rawHostWithPort?.startsWith("[") === true
    ? rawHostWithPort.slice(0, rawHostWithPort.indexOf("]") + 1)
    : rawHostWithPort?.split(":", 1)[0];
  const canonicalIpv4 = parseIpv4(url.hostname);
  const normalizedRawHost = rawHost?.toLowerCase().replace(/\.+$/, "");

  if ((url.protocol !== "http:" && url.protocol !== "https:")
    || url.username !== ""
    || url.password !== ""
    || url.hostname === ""
    || url.hash !== ""
    || isBlockedHostname(url.hostname)
    || (canonicalIpv4 !== null && normalizedRawHost !== url.hostname.toLowerCase())) {
    return null;
  }

  return url.toString();
}

function sanitizeName(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length === 0
    || normalized.length > MAX_NAME_LENGTH
    || /[\u0000-\u001f\u007f/\\]/.test(normalized)
    || normalized === "."
    || normalized === "..") {
    return null;
  }
  return normalized;
}

export function isNormalizedInfoHash(value: string): boolean {
  return INFO_HASH_PATTERN.test(value);
}

export function validateResolvedTorrentCandidate(
  value: unknown,
  now = Date.now(),
): ResolvedTorrentCandidate | null {
  if (!isObject(value)) return null;
  const url = validatePlaybackUrl(value.url);
  const name = sanitizeName(value.name);
  if (url === null
    || name === null
    || (value.source !== "authorized-resolver" && value.source !== "local-test")) {
    return null;
  }

  if (value.sizeBytes !== undefined
    && (typeof value.sizeBytes !== "number"
      || !Number.isSafeInteger(value.sizeBytes)
      || value.sizeBytes <= 0)) {
    return null;
  }

  if (value.expiresAt !== undefined) {
    if (typeof value.expiresAt !== "string") return null;
    const expiresAt = Date.parse(value.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  }

  let redirectChain: readonly string[] | undefined;
  if (value.redirectChain !== undefined) {
    if (!Array.isArray(value.redirectChain)
      || value.redirectChain.length === 0
      || value.redirectChain.length > MAX_REDIRECTS) {
      return null;
    }
    const validated = value.redirectChain.map(validatePlaybackUrl);
    if (validated.some((entry) => entry === null)) return null;
    redirectChain = validated as string[];
    if (redirectChain.at(-1) !== url) return null;
  }

  return Object.freeze({
    url,
    ...(name === undefined ? {} : { name }),
    ...(value.sizeBytes === undefined ? {} : { sizeBytes: value.sizeBytes }),
    source: value.source,
    ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
    ...(redirectChain === undefined ? {} : { redirectChain: Object.freeze([...redirectChain]) }),
  });
}
