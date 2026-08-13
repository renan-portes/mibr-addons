/**
 * HTML parsing utilities shared across indexers.
 * Pure functions — no external dependencies.
 */

/** Extract all magnet links from raw HTML */
export function extractMagnets(html: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  // Match magnet: URIs including query params until whitespace / quote / angle bracket
  const re = /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}[^"'\s<>]*/gi;
  for (const match of html.matchAll(re)) {
    const m = match[0];
    if (!seen.has(m)) {
      seen.add(m);
      results.push(m);
    }
  }
  return results;
}

/** Extract the info hash (hex, lowercase) from a magnet URI */
export function extractInfoHash(magnet: string): string | undefined {
  // SHA-1 hex (40 chars)
  const hexMatch = magnet.match(/urn:btih:([a-fA-F0-9]{40})/i);
  if (hexMatch) return hexMatch[1].toLowerCase();

  // Base32 (32 chars) — convert to hex
  const b32Match = magnet.match(/urn:btih:([a-zA-Z2-7]{32})/i);
  if (b32Match) {
    return base32ToHex(b32Match[1].toUpperCase());
  }
  return undefined;
}

/** Decode quality label from title string */
export function extractQuality(text: string): string | undefined {
  if (/\b(4k|2160p|uhd)\b/i.test(text)) return "4K";
  if (/\b1080p\b/i.test(text)) return "1080p";
  if (/\b720p\b/i.test(text)) return "720p";
  if (/\b480p\b/i.test(text)) return "480p";
  return undefined;
}

/** Decode audio languages from title string */
export function extractAudio(text: string): string[] {
  if (/dual[\s\-]?[áa]udio|dual[\s\-]?audio|\bdual\b/i.test(text)) {
    return ["Português", "Inglês"];
  }
  if (/\bdublado\b|\bnacional\b/i.test(text)) {
    return ["Português (Dublado)"];
  }
  if (/\blegendado\b|\bleg\b/i.test(text)) {
    return ["Inglês (Legendado)"];
  }
  return [];
}

/** Extract human-readable file size from text (e.g. "2.5 GB", "900 MB") */
export function extractSize(text: string): string | undefined {
  const match = text.match(/(\d+(?:[.,]\d+)?\s*(?:GB|MB|TB|GiB|MiB))/i);
  return match ? match[1].trim() : undefined;
}

/** Extract seeders count from text */
export function extractSeeders(text: string): number | undefined {
  // Common patterns: "1200 seeders", "👥 1.2K", "Seeds: 450"
  const patterns = [
    /(\d[\d,.]*)\s*seed(?:ers?)?/i,
    /seed(?:ers?)?\s*[:\-]?\s*(\d[\d,.]*)/i,
    /👥\s*(\d[\d,.]*[kK]?)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      let n = m[1].replace(/,/g, "");
      if (/k/i.test(n)) return Math.round(parseFloat(n) * 1000);
      return parseInt(n, 10);
    }
  }
  return undefined;
}

/**
 * Extract absolute href links from HTML <a> tags matching a host pattern.
 * Returns a deduplicated list, limited to maxLinks.
 */
export function extractLinks(html: string, hostContains: string, maxLinks = 8): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  const re = /href="(https?:\/\/[^"]+)"/gi;
  for (const match of html.matchAll(re)) {
    const href = match[1];
    if (href.includes(hostContains) && !seen.has(href)) {
      seen.add(href);
      results.push(href);
      if (results.length >= maxLinks) break;
    }
  }
  return results;
}

/** Extract the text content of <title> or first <h1> */
export function extractPageTitle(html: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripHtml(h1[1]).trim();
  const title = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (title) return stripHtml(title[1]).split(" - ")[0].split(" | ")[0].trim();
  return "";
}

/** Strip HTML tags from a string */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Build a search URL by appending the WordPress ?s= query parameter */
export function buildSearchUrl(baseUrl: string, query: string): string {
  const url = new URL(baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
  url.searchParams.set("s", query);
  return url.toString();
}

// ── Base32 → Hex conversion ───────────────────────────────────────────────

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32ToHex(b32: string): string {
  let bits = "";
  for (const ch of b32) {
    const idx = BASE32_CHARS.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  let hex = "";
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex.toLowerCase();
}
