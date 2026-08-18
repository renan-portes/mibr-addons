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

/** Resolve magnet links by following protector/ad-redirect links if direct magnets are missing */
export async function resolveProtectorMagnets(html: string, signal: AbortSignal, maxLinks = 4): Promise<string[]> {
  const direct = extractMagnets(html);
  if (direct.length > 0) return direct;

  const hrefMatches = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const candidateLinks = hrefMatches.filter((h) =>
    h.includes("go.php") ||
    h.includes("links.php") ||
    h.includes("systemads") ||
    h.includes("videosad") ||
    h.includes("protet") ||
    h.includes("link=") ||
    h.includes("relink")
  ).filter((h) => !h.endsWith(".css") && !h.endsWith(".js"));

  const magnets: string[] = [];
  const seen = new Set<string>();

  for (const pUrl of candidateLinks.slice(0, maxLinks)) {
    if (signal.aborted) break;
    try {
      const pRes = await fetch(pUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        redirect: "follow",
        signal,
      });
      const pHtml = await pRes.text();
      const pMagnets = extractMagnets(pHtml);
      for (const mag of pMagnets) {
        if (!seen.has(mag)) {
          seen.add(mag);
          magnets.push(mag);
        }
      }
    } catch {
      // Ignore individual protector failure
    }
  }

  return magnets;
}

/** Verify if a post title matches the target movie/series title and year */
export function isMatchingTitle(
  postTitle: string,
  targetTitle?: string,
  targetOriginal?: string,
  targetYear?: number,
): boolean {
  if (!targetTitle && !targetOriginal) return true;

  const normPost = postTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (targetYear) {
    const yearMatches = postTitle.match(/\b(19\d\d|20\d\d)\b/g);
    if (yearMatches && yearMatches.length > 0) {
      const hasMatchingYear = yearMatches.some((y) => Number(y) === targetYear);
      if (!hasMatchingYear) {
        return false;
      }
    }
  }

  const normTarget = targetTitle ? targetTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
  const normOrig = targetOriginal ? targetOriginal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

  const cleanTargetWords = normTarget ? normTarget.replace(/[^\w\s]/g, "").split(/\s+/).filter((w) => w.length > 2) : [];
  const cleanOrigWords = normOrig ? normOrig.replace(/[^\w\s]/g, "").split(/\s+/).filter((w) => w.length > 2) : [];

  if (cleanTargetWords.length === 0 && cleanOrigWords.length === 0) return true;

  const postWords = new Set(normPost.replace(/[^\w\s]/g, "").split(/\s+/));

  const targetMatch = cleanTargetWords.length > 0 && cleanTargetWords.every((w) => postWords.has(w));
  const origMatch = cleanOrigWords.length > 0 && cleanOrigWords.every((w) => postWords.has(w));

  return targetMatch || origMatch;
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
 * Excludes navigation menus, categories, CSS/JS/images and home pages.
 * Returns a deduplicated list, limited to maxLinks.
 */
export function extractLinks(html: string, hostContains: string, maxLinks = 8): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  const re = /href=["']([^"']+)["']/gi;
  const IGNORE_PATTERNS = /\.(css|js|png|jpg|jpeg|gif|svg|ico|xml|rss)(\?.*)?$/i;
  const IGNORE_KEYWORDS = /(wp-json|xmlrpc|feed|comments|category|generos|resolucao|lancamento|tag|page|contato|dmca|pedidos|termos|privacidade|sitemap|\/core\/|\/filmes\/?$|\/series\/?$|\/anime\/?$)/i;

  for (const match of html.matchAll(re)) {
    let href = match[1];
    if (href.startsWith("/")) {
      href = `https://${hostContains}${href}`;
    }
    const cleanUrl = href.split("#")[0]!;
    if (
      cleanUrl.includes(hostContains) &&
      cleanUrl !== `https://${hostContains}` &&
      cleanUrl !== `https://${hostContains}/` &&
      !IGNORE_PATTERNS.test(cleanUrl) &&
      !IGNORE_KEYWORDS.test(cleanUrl) &&
      !cleanUrl.includes("?s=") &&
      !seen.has(cleanUrl)
    ) {
      seen.add(cleanUrl);
      results.push(cleanUrl);
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
