import { getManifest } from "../addon/manifest.js";
import { ChannelStore, getDefaultChannelStore } from "../tv/channelStore.js";
import { StreamProxy } from "../tv/streamProxy.js";
import type {
  ErrorResponse,
  StremioCatalogResponse,
  StremioMeta,
  StremioMetaResponse,
  StremioStreamResponse,
} from "../types/stremio.js";
import { renderConfigureHtml } from "../web/configureHtml.js";

export type RouteResult =
  | { status: 200; contentType?: "application/json"; body: any }
  | { status: 200; contentType: "text/html"; html: string }
  | {
      status: number;
      contentType: string;
      rawBody: string | Buffer | Uint8Array;
      headers?: Record<string, string>;
    }
  | { status: 400 | 404 | 500 | 502; body: ErrorResponse };

const STREAM_PATH_PATTERN = /^(?:\/([^/]+))?\/stream\/(?:channel|tv)\/([^/]+)\.json$/;
const CONFIG_MANIFEST_PATTERN = /^\/([^/]+)\/manifest\.json$/;
const CATALOG_PATH_PATTERN = /^(?:\/([^/]+))?\/catalog\/(?:channel|tv)\/([^/]+?)(?:\/(.+))?\.json$/;
const META_PATH_PATTERN = /^(?:\/([^/]+))?\/meta\/(?:channel|tv)\/([^/]+)\.json$/;
const PROXY_STREAM_PATTERN = /^\/proxy\/stream\/([^/]+)\.m3u8$/;

const TV_LOGO_BASE = "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/brazil";

const CHANNEL_LOGOS: Record<string, string> = {
  // Globo
  globo:      `${TV_LOGO_BASE}/globo-br.png`,
  // SBT
  sbt:        `${TV_LOGO_BASE}/sbt-br.png`,
  // Band
  band:       `${TV_LOGO_BASE}/band-br.png`,
  // Record
  record:     `${TV_LOGO_BASE}/record-br.png`,
  // Sports
  sportv:     `${TV_LOGO_BASE}/sportv-br.png`,
  // News
  "globo-news": `${TV_LOGO_BASE}/globo-news-br.png`,
  "record-news": `${TV_LOGO_BASE}/record-news-br.png`,
  "band-news": `${TV_LOGO_BASE}/band-news-br.png`,
  "jovem-pan-news": `${TV_LOGO_BASE}/jovem-pan-news-br.png`,
  "cnn-brasil": `${TV_LOGO_BASE}/cnn-brasil-br.png`,
  // GNT / Multishow / Globosat
  gnt:        `${TV_LOGO_BASE}/gnt-br.png`,
  multishow:  `${TV_LOGO_BASE}/multishow-br.png`,
  premiere:   `${TV_LOGO_BASE}/premiere-br.png`,
  // Movies & Series
  hbo:        `${TV_LOGO_BASE}/hbo-br.png`,
  "hbo-2":    `${TV_LOGO_BASE}/hbo-2-br.png`,
  max:        `${TV_LOGO_BASE}/hbo-br.png`,
  tnt:        `${TV_LOGO_BASE}/tnt-br.png`,
  "tnt-series": `${TV_LOGO_BASE}/tnt-series-br.png`,
  warner:     `${TV_LOGO_BASE}/warner-channel-br.png`,
  "sony-channel": `${TV_LOGO_BASE}/sony-channel-br.png`,
  axn:        `${TV_LOGO_BASE}/axn-br.png`,
  paramount:  `${TV_LOGO_BASE}/paramount-network-br.png`,
  megapix:    `${TV_LOGO_BASE}/megapix-br.png`,
  space:      `${TV_LOGO_BASE}/space-br.png`,
  // Kids
  cartoon:    `${TV_LOGO_BASE}/cartoon-network-br.png`,
  discovery:  `${TV_LOGO_BASE}/discovery-kids-br.png`,
  "discovery-kids": `${TV_LOGO_BASE}/discovery-kids-br.png`,
  // Others
  "rede-tv":  `${TV_LOGO_BASE}/rede-tv-br.png`,
  "tv-cultura": `${TV_LOGO_BASE}/tv-cultura-br.png`,
  "tv-brasil": `${TV_LOGO_BASE}/tv-brasil-br.png`,
};

function getLocalLogo(channelId: string): string | undefined {
  const id = channelId.replace(/^mibr:tv:/, "");
  // Exact match first
  if (CHANNEL_LOGOS[id]) return CHANNEL_LOGOS[id];
  // Prefix match: pick the longest matching key
  let best: string | undefined;
  let bestLen = 0;
  for (const [key, url] of Object.entries(CHANNEL_LOGOS)) {
    if (id.startsWith(key) && key.length > bestLen) {
      best = url;
      bestLen = key.length;
    }
  }
  return best;
}

export async function routeRequest(
  method: string,
  rawUrl: string,
  hostUrl = "http://127.0.0.1:7000",
  channelStore: ChannelStore = getDefaultChannelStore(),
): Promise<RouteResult> {
  if (method !== "GET") {
    return { status: 404, body: { error: "Not found" } };
  }

  const cleanHost = hostUrl.replace(/\/$/, "");
  const parsedUrl = new URL(rawUrl, "http://localhost");
  const pathname = parsedUrl.pathname;

  // 1. Web Configuration UI
  if (pathname === "/" || pathname === "/configure") {
    return {
      status: 200,
      contentType: "text/html",
      html: renderConfigureHtml(cleanHost, channelStore),
    };
  }

  // 2. Manifest
  if (pathname === "/manifest.json") {
    return {
      status: 200,
      contentType: "application/json",
      body: getManifest(cleanHost, channelStore.getGenres()),
    };
  }

  const configManifestMatch = CONFIG_MANIFEST_PATTERN.exec(pathname);
  if (
    configManifestMatch &&
    configManifestMatch[1] &&
    !["stream", "catalog", "meta", "proxy"].includes(configManifestMatch[1])
  ) {
    return {
      status: 200,
      contentType: "application/json",
      body: getManifest(cleanHost, channelStore.getGenres()),
    };
  }

  // 3. Catalog (/catalog/channel/:id.json or /catalog/channel/:id/:extra.json)
  const catalogMatch = CATALOG_PATH_PATTERN.exec(pathname);
  if (catalogMatch) {
    const catalogId = catalogMatch[2];
    const extra = catalogMatch[3];
    let genre: string | undefined;
    let search: string | undefined;
    let skip: number | undefined;

    if (catalogId === "mibr-tv-abertos") genre = "Abertos";
    else if (catalogId === "mibr-tv-esportes") genre = "Esportes";
    else if (catalogId === "mibr-tv-filmes") genre = "Filmes & Séries";
    else if (catalogId === "mibr-tv-noticias") genre = "Notícias";
    else if (catalogId === "mibr-tv-infantil") genre = "Infantil";

    if (extra) {
      const extraParts = extra.split("&");
      for (const part of extraParts) {
        const [k, v] = part.split("=");
        if (k === "genre" && v) genre = decodeURIComponent(v);
        if (k === "search" && v) search = decodeURIComponent(v);
        if (k === "skip" && v) skip = Number(v);
      }
    }

    const channels = channelStore.getChannels({ genre, search, skip });
    const metas: StremioMeta[] = channels.map((ch) => ({
      id: ch.id,
      type: "tv",
      name: ch.name,
      poster: getLocalLogo(ch.id) || ch.logo || `${cleanHost}/mibr-logo.png`,
      posterShape: "square",
      banner: getLocalLogo(ch.id) || ch.logo,
      logo: getLocalLogo(ch.id) || ch.logo,
      background: getLocalLogo(ch.id) || ch.logo || `${cleanHost}/mibr-logo.png`,
      description: `Transmissão Ao Vivo • ${ch.name} (${ch.group})`,
      genres: [ch.group],
    }));

    const body: StremioCatalogResponse = { metas };
    return { status: 200, contentType: "application/json", body };
  }

  // 4. Meta (/meta/channel/:id.json)
  const metaMatch = META_PATH_PATTERN.exec(pathname);
  if (metaMatch && metaMatch[2]) {
    const id = decodeURIComponent(metaMatch[2]);
    const ch = channelStore.getChannelById(id);
    if (!ch) {
      return { status: 404, body: { error: "Channel not found" } };
    }

    const meta: StremioMeta = {
      id: ch.id,
      type: "tv",
      name: ch.name,
      poster: getLocalLogo(ch.id) || ch.logo || `${cleanHost}/mibr-logo.png`,
      posterShape: "square",
      banner: getLocalLogo(ch.id) || ch.logo,
      logo: getLocalLogo(ch.id) || ch.logo,
      background: getLocalLogo(ch.id) || ch.logo || `${cleanHost}/mibr-logo.png`,
      description: `Transmissão Ao Vivo • ${ch.name} (${ch.group})`,
      genres: [ch.group],
    };

    const body: StremioMetaResponse = { meta };
    return { status: 200, contentType: "application/json", body };
  }

  // 5. Streams (/stream/channel/:id.json)
  const streamMatch = STREAM_PATH_PATTERN.exec(pathname);
  if (streamMatch && streamMatch[2]) {
    const id = decodeURIComponent(streamMatch[2]);
    const ch = channelStore.getChannelById(id);
    if (!ch) {
      const emptyResponse: StremioStreamResponse = { streams: [] };
      return { status: 200, contentType: "application/json", body: emptyResponse };
    }

    const proxyEnabled = process.env.STREAM_PROXY_ENABLED === "true";
    const playUrl = proxyEnabled
      ? `${cleanHost}/proxy/stream/${encodeURIComponent(ch.id)}.m3u8`
      : ch.streamUrl;

    const body: StremioStreamResponse = {
      streams: [
        {
          name: "MIBR TV",
          title: `${ch.name} • Ao Vivo HD`,
          url: playUrl,
          behaviorHints: {
            notWebReady: true,
          },
        },
      ],
    };

    return { status: 200, contentType: "application/json", body };
  }

  // 6. Proxy stream master playlist (/proxy/stream/:id.m3u8)
  const proxyStreamMatch = PROXY_STREAM_PATTERN.exec(pathname);
  if (proxyStreamMatch && proxyStreamMatch[1]) {
    const channelId = decodeURIComponent(proxyStreamMatch[1]);
    const proxy = new StreamProxy(channelStore);
    const result = await proxy.handleStreamPlaylist(channelId, cleanHost);

    return {
      status: result.status,
      contentType: result.contentType,
      rawBody: result.body ?? "",
      headers: result.headers,
    };
  }

  // 7. Proxy segment/chunk (/proxy/segment?url=...)
  if (pathname === "/proxy/segment") {
    const targetUrl = parsedUrl.searchParams.get("url");
    if (!targetUrl) {
      return { status: 400, body: { error: "Missing segment url" } };
    }

    const proxy = new StreamProxy(channelStore);
    const result = await proxy.handleSegment(targetUrl);

    return {
      status: result.status,
      contentType: result.contentType,
      rawBody: result.body ?? "",
      headers: result.headers,
    };
  }

  return { status: 404, body: { error: "Not found" } };
}
