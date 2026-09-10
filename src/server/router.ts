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

function getLocalLogo(channelId: string, cleanHost: string): string | undefined {
  if (channelId.includes("globo")) return `${cleanHost}/logos/globo.png`;
  if (channelId.includes("sbt")) return `${cleanHost}/logos/sbt.png`;
  if (channelId.includes("band")) return `${cleanHost}/logos/band.png`;
  if (channelId.includes("record")) return `${cleanHost}/logos/record.png`;
  return undefined;
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
