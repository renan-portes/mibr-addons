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

const TV_LOGO_ROOT = "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries";

const CHANNEL_LOGOS: Record<string, string> = {
  // Abertos
  globo:           `${TV_LOGO_ROOT}/brazil/globo-br.png`,
  sbt:             `${TV_LOGO_ROOT}/brazil/sbt-br.png`,
  band:            `${TV_LOGO_ROOT}/brazil/band-br.png`,
  record:          `${TV_LOGO_ROOT}/brazil/rede-record-br.png`,

  // Esportes
  "band-sports":   `${TV_LOGO_ROOT}/brazil/band-sports-br.png`,
  "caze-tv":       "local:cazetv.png",
  combate:         "local:combate.svg",
  dazn:            `${TV_LOGO_ROOT}/international/dazn-int.png`,
  "espn-2":        `${TV_LOGO_ROOT}/world-latin-america/espn-2-lam.png`,
  "espn-3":        `${TV_LOGO_ROOT}/world-latin-america/espn-3-lam.png`,
  "espn-4":        `${TV_LOGO_ROOT}/brazil/espn-4-br.png`,
  "espn-5":        `${TV_LOGO_ROOT}/brazil/espn-5-br.png`,
  "espn-6":        `${TV_LOGO_ROOT}/world-latin-america/espn-6-lam.png`,
  espn:            `${TV_LOGO_ROOT}/world-latin-america/espn-lam.png`,
  "ge-tv":         `${TV_LOGO_ROOT}/brazil/ge-tv-br.png`,
  nsports:         "local:nsports.svg",
  "nosso-futebol": "local:nossofutebol.png",
  premiere:        `${TV_LOGO_ROOT}/brazil/premiere-br.png`,
  "sportv-2":      `${TV_LOGO_ROOT}/brazil/sportv2-br.png`,
  "sportv-3":      `${TV_LOGO_ROOT}/brazil/sportv3-br.png`,
  sportv:          `${TV_LOGO_ROOT}/brazil/sportv-br.png`,
  "x-sports":      `${TV_LOGO_ROOT}/brazil/x-sports-br.png`,

  // Streaming
  "amazon-prime":  "local:amazonprime.svg",
  "apple-tv":      "local:appletv.svg",
  "disney-plus":   `${TV_LOGO_ROOT}/united-states/disney-plus-us.png`,
  "globoplay-novelas": `${TV_LOGO_ROOT}/brazil/globoplay-novelas-br.png`,
  max:             "local:max.svg",
  "paramount-plus":`${TV_LOGO_ROOT}/united-states/paramount-plus-us.png`,

  // Notícias
  "band-news":     `${TV_LOGO_ROOT}/brazil/band-news-br.png`,
  "cnn-brasil":    `${TV_LOGO_ROOT}/brazil/cnn-brasil-br.png`,
  "globo-news":    `${TV_LOGO_ROOT}/brazil/globo-news-br.png`,
  "jovem-pan-news":`${TV_LOGO_ROOT}/brazil/jovem-pan-news-br.png`,
  "record-news":   `${TV_LOGO_ROOT}/brazil/record-news-br.png`,

  // Infantil
  cartoonito:      `${TV_LOGO_ROOT}/brazil/cartoonito-br.png`,
  "cartoon-network": `${TV_LOGO_ROOT}/brazil/cartoon-network-br.png`,
  "discovery-kids":`${TV_LOGO_ROOT}/brazil/discovery-kids-br.png`,
  gloob:           `${TV_LOGO_ROOT}/brazil/gloob-br.png`,
  gloobinho:       `${TV_LOGO_ROOT}/brazil/gloobinho-br.png`,
  nickelodeon:     `${TV_LOGO_ROOT}/world-latin-america/nickelodeon-lam.png`,
  "nick-jr":       `${TV_LOGO_ROOT}/united-states/nick-jr-us.png`,
  tooncast:        `${TV_LOGO_ROOT}/brazil/tooncast-br.png`,

  // Documentários
  "animal-planet": `${TV_LOGO_ROOT}/world-latin-america/animal-planet-lam.png`,
  "canal-off":     `${TV_LOGO_ROOT}/brazil/canal-off-br.png`,
  "discovery-channel": `${TV_LOGO_ROOT}/argentina/discovery-channel-ar.png`,
  "discovery-hh":  `${TV_LOGO_ROOT}/world-latin-america/discovery-home-and-health-lam.png`,
  "discovery-home-and-health": `${TV_LOGO_ROOT}/world-latin-america/discovery-home-and-health-lam.png`,
  "discovery-id":  `${TV_LOGO_ROOT}/international/investigation-discovery-int.png`,
  "investigation-discovery": `${TV_LOGO_ROOT}/international/investigation-discovery-int.png`,
  "discovery-science": `${TV_LOGO_ROOT}/argentina/discovery-science-ar.png`,
  "discovery-theater": `${TV_LOGO_ROOT}/world-latin-america/discovery-theater-hd-lam.png`,
  "discovery-turbo": `${TV_LOGO_ROOT}/brazil/discovery-turbo-br.png`,
  "discovery-world": `${TV_LOGO_ROOT}/argentina/discovery-world-hd-ar.png`,
  "food-network":  `${TV_LOGO_ROOT}/argentina/food-network-ar.png`,
  history:         `${TV_LOGO_ROOT}/argentina/history-channel-ar.png`,
  "history-2":     `${TV_LOGO_ROOT}/world-latin-america/history-channel-2-lam.png`,

  // Filmes & Séries
  ae:              `${TV_LOGO_ROOT}/brazil/a-and-e-br.png`,
  amc:             `${TV_LOGO_ROOT}/united-states/amc-us.png`,
  axn:             `${TV_LOGO_ROOT}/brazil/axn-br.png`,
  cinemax:         `${TV_LOGO_ROOT}/brazil/cinemax-br.png`,
  "hbo-2":         `${TV_LOGO_ROOT}/brazil/hbo-2-br.png`,
  "hbo-family":    `${TV_LOGO_ROOT}/brazil/hbo-family-br.png`,
  "hbo-mundi":     `${TV_LOGO_ROOT}/brazil/hbo-mundi-br.png`,
  "hbo-plus":      `${TV_LOGO_ROOT}/brazil/hbo-plus-br.png`,
  "hbo-pop":       `${TV_LOGO_ROOT}/brazil/hbo-pop-br.png`,
  "hbo-signature": `${TV_LOGO_ROOT}/brazil/hbo-signature-br.png`,
  "hbo-xtreme":    `${TV_LOGO_ROOT}/brazil/hbo-xtreme-br.png`,
  hbo:             `${TV_LOGO_ROOT}/brazil/hbo-br.png`,
  megapix:         `${TV_LOGO_ROOT}/brazil/megapix-br.png`,
  "paramount-network": `${TV_LOGO_ROOT}/brazil/paramount-network-br.png`,
  paramount:       `${TV_LOGO_ROOT}/brazil/paramount-network-br.png`,
  "sony-channel":  `${TV_LOGO_ROOT}/brazil/sony-channel-br.png`,
  space:           `${TV_LOGO_ROOT}/brazil/space-br.png`,
  "studio-universal": `${TV_LOGO_ROOT}/brazil/studio-universal-br.png`,
  "telecine-action": `${TV_LOGO_ROOT}/brazil/tele-cine-action-br.png`,
  "telecine-cult": `${TV_LOGO_ROOT}/brazil/tele-cine-cult-br.png`,
  "telecine-fun":  `${TV_LOGO_ROOT}/brazil/tele-cine-fun-br.png`,
  "telecine-pipoca": `${TV_LOGO_ROOT}/brazil/tele-cine-pipoca-br.png`,
  "telecine-premium": `${TV_LOGO_ROOT}/brazil/tele-cine-premium-br.png`,
  "telecine-touch": `${TV_LOGO_ROOT}/brazil/tele-cine-touch-br.png`,
  "tnt-novelas":   `${TV_LOGO_ROOT}/world-latin-america/tnt-novelas-lam.png`,
  "tnt-series":    `${TV_LOGO_ROOT}/brazil/tnt-series-br.png`,
  tnt:             `${TV_LOGO_ROOT}/brazil/tnt-br.png`,
  "universal-tv":  `${TV_LOGO_ROOT}/brazil/universal-tv-br.png`,
  "warner-channel": `${TV_LOGO_ROOT}/brazil/warner-channel-br.png`,
  warner:          `${TV_LOGO_ROOT}/brazil/warner-channel-br.png`,

  // Entretenimento
  "adult-swim":    `${TV_LOGO_ROOT}/united-states/adult-swim-us.png`,
  "comedy-central": `${TV_LOGO_ROOT}/argentina/comedy-central-ar.png`,
  gnt:             `${TV_LOGO_ROOT}/brazil/gnt-br.png`,
  mtv:             `${TV_LOGO_ROOT}/united-states/mtv-us.png`,
  multishow:       `${TV_LOGO_ROOT}/brazil/multishow-br.png`,

  // Outros
  "rede-tv":       `${TV_LOGO_ROOT}/brazil/rede-tv-br.png`,
  "tv-cultura":    `${TV_LOGO_ROOT}/brazil/tv-cultura-br.png`,
  "tv-brasil":     `${TV_LOGO_ROOT}/brazil/tv-brasil-br.png`,
};

function getLocalLogo(channelId: string, cleanHost: string): string | undefined {
  const id = channelId.replace(/^mibr:tv:/, "");
  // Exact match first
  let logoUrl = CHANNEL_LOGOS[id];
  // Prefix match: pick the longest matching key
  if (!logoUrl) {
    let bestLen = 0;
    for (const [key, url] of Object.entries(CHANNEL_LOGOS)) {
      if (id.startsWith(key) && key.length > bestLen) {
        logoUrl = url;
        bestLen = key.length;
      }
    }
  }
  if (!logoUrl) return undefined;
  // Serve via our proxy to add padding and prevent circular clip from cutting logo edges
  return `${cleanHost}/logo-proxy/${encodeURIComponent(logoUrl)}`;
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
    else if (catalogId === "mibr-tv-streaming") genre = "Streaming";
    else if (catalogId === "mibr-tv-filmes") genre = "Filmes & Séries";
    else if (catalogId === "mibr-tv-noticias") genre = "Notícias";
    else if (catalogId === "mibr-tv-infantil") genre = "Infantil";
    else if (catalogId === "mibr-tv-documentarios") genre = "Documentários";
    else if (catalogId === "mibr-tv-entretenimento") genre = "Entretenimento";

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
      poster: getLocalLogo(ch.id, cleanHost) || ch.logo || `${cleanHost}/mibr-logo.png`,
      posterShape: "square",
      banner: getLocalLogo(ch.id, cleanHost) || ch.logo,
      logo: getLocalLogo(ch.id, cleanHost) || ch.logo,
      background: getLocalLogo(ch.id, cleanHost) || ch.logo || `${cleanHost}/mibr-logo.png`,
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
      poster: getLocalLogo(ch.id, cleanHost) || ch.logo || `${cleanHost}/mibr-logo.png`,
      posterShape: "square",
      banner: getLocalLogo(ch.id, cleanHost) || ch.logo,
      logo: getLocalLogo(ch.id, cleanHost) || ch.logo,
      background: getLocalLogo(ch.id, cleanHost) || ch.logo || `${cleanHost}/mibr-logo.png`,
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
