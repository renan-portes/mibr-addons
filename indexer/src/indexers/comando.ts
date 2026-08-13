/**
 * Comando Indexer — Scrapes comandotorrents.to
 */

import { flareGet } from "../flaresolverr.js";
import { resolveImdbTitle } from "../cinemeta.js";
import {
  extractAudio,
  extractInfoHash,
  extractLinks,
  extractMagnets,
  extractPageTitle,
  extractQuality,
  extractSize,
} from "../parsers.js";
import type { IndexerRequest, IndexerResponse, TorrentResult } from "../types.js";

const COMANDO_SITE_URL = process.env.COMANDO_SITE_URL || process.env.INDEXER_SITE_URL || "https://comandotorrents.to";
const HOST_FRAGMENT = "comandotorrents.to";

const REDIRECT_LINK_PATTERN = /https?:\/\/(?:systemads1\.com|videosad\.net)\/[^\s"']+/gi;

function buildSearchUrl(siteUrl: string, query: string): string {
  const url = new URL(siteUrl);
  url.searchParams.set("s", query);
  return url.toString();
}

async function resolveRedirectMagnet(url: string, signal: AbortSignal): Promise<string[]> {
  try {
    const { html } = await flareGet(url, signal);
    return extractMagnets(html);
  } catch {
    return [];
  }
}

async function scrapePost(postUrl: string, imdb: string | undefined, signal: AbortSignal): Promise<TorrentResult[]> {
  try {
    const { html } = await flareGet(postUrl, signal);
    let magnets = extractMagnets(html);

    if (magnets.length === 0) {
      const redirectLinks: string[] = [];
      for (const match of html.matchAll(REDIRECT_LINK_PATTERN)) {
        if (match[1] && !redirectLinks.includes(match[1])) {
          redirectLinks.push(match[1]);
        }
      }

      if (redirectLinks.length > 0) {
        const resolved = await Promise.all(
          redirectLinks.slice(0, 5).map((link) => resolveRedirectMagnet(link, signal))
        );
        magnets = resolved.flat();
      }
    }

    if (magnets.length === 0) return [];

    const pageTitle = extractPageTitle(html);
    const quality = extractQuality(pageTitle) ?? extractQuality(html);
    const audio = extractAudio(pageTitle).length > 0 ? extractAudio(pageTitle) : extractAudio(html);
    const size = extractSize(html);

    return magnets.map((magnet) => {
      const magQuality = extractQuality(magnet) ?? quality ?? "HD";
      return {
        title: `Comando | ${pageTitle || "Conteúdo"}`,
        imdb,
        audio: audio.length > 0 ? audio : ["Português (Dublado)"],
        quality: magQuality,
        magnet,
        info_hash: extractInfoHash(magnet),
        size: size ?? undefined,
      };
    });
  } catch {
    return [];
  }
}

export async function scrapeComando(req: IndexerRequest, signal: AbortSignal): Promise<IndexerResponse> {
  const searchQueries: string[] = [];
  if (req.imdb) {
    const meta = await resolveImdbTitle(req.imdb, signal);
    if (meta?.title) {
      searchQueries.push(meta.title);
      const cleanTitle = meta.title.replace(/^(the|a|an|o|a|os|as)\s+/i, "");
      if (cleanTitle !== meta.title) searchQueries.push(cleanTitle);
    }
    if (meta?.originalTitle && meta.originalTitle !== meta.title) {
      searchQueries.push(meta.originalTitle);
      const cleanOriginal = meta.originalTitle.replace(/^(the|a|an)\s+/i, "");
      if (cleanOriginal !== meta.originalTitle) searchQueries.push(cleanOriginal);
    }
    searchQueries.push(req.imdb);
  } else if (req.q) {
    searchQueries.push(req.q);
  }

  if (searchQueries.length === 0) return { results: [], count: 0 };

  const limit = req.limit ?? 5;
  const allResults: TorrentResult[] = [];

  for (const query of searchQueries) {
    const searchUrl = buildSearchUrl(COMANDO_SITE_URL, query);
    try {
      const { html } = await flareGet(searchUrl, signal);
      const postLinks = extractLinks(html, HOST_FRAGMENT, limit);
      if (postLinks.length > 0) {
        const scrapedNested = await Promise.all(
          postLinks.map((url) => scrapePost(url, req.imdb, signal))
        );
        const results = scrapedNested.flat();
        if (results.length > 0) {
          allResults.push(...results);
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[comando] Search failed for "${query}": ${msg}`);
    }
  }

  const seenHashes = new Set<string>();
  const deduplicated = allResults.filter((r) => {
    if (r.info_hash && seenHashes.has(r.info_hash)) return false;
    if (r.info_hash) seenHashes.add(r.info_hash);
    return true;
  });

  return { results: deduplicated, count: deduplicated.length };
}
