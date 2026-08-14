import { getManifest } from "../addon/manifest.js";
import { createProviderManagerForConfig, getDefaultStreamService } from "../app/bootstrap.js";
import { StreamService, StreamRequestError } from "../services/streamService.js";
import type { ErrorResponse, StremioStreamResponse, StremioStream } from "../types/stremio.js";
import type { UserConfig } from "../types/userConfig.js";
import { decodeUserConfig } from "../utils/configEncoder.js";
import { renderConfigureHtml } from "../web/configureHtml.js";

export type RouteResult =
  | { status: 200; contentType?: "application/json"; body: ReturnType<typeof getManifest> | StremioStreamResponse }
  | { status: 200; contentType: "text/html"; html: string }
  | { status: 400; body: ErrorResponse }
  | { status: 404; body: ErrorResponse }
  | { status: 500; body: ErrorResponse };

const STREAM_PATH_PATTERN = /^\/stream\/([^/]+)\/([^/]+)\.json$/;
const CONFIG_MANIFEST_PATTERN = /^\/([^/]+)\/manifest\.json$/;
const CONFIG_STREAM_PATTERN = /^\/([^/]+)\/stream\/([^/]+)\/([^/]+)\.json$/;

interface StreamPathParams {
  configStr?: string;
  type: string;
  id: string;
}

function parsePath(pathname: string): { type: "configure" } | { type: "manifest"; configStr?: string } | { type: "stream"; params: StreamPathParams } | null {
  if (pathname === "/" || pathname === "/configure") {
    return { type: "configure" };
  }

  if (pathname === "/manifest.json") {
    return { type: "manifest" };
  }

  const configManifestMatch = CONFIG_MANIFEST_PATTERN.exec(pathname);
  if (configManifestMatch && configManifestMatch[1] && configManifestMatch[1] !== "stream") {
    return { type: "manifest", configStr: configManifestMatch[1] };
  }

  const defaultStreamMatch = STREAM_PATH_PATTERN.exec(pathname);
  if (defaultStreamMatch && defaultStreamMatch[1] && defaultStreamMatch[2]) {
    return { type: "stream", params: { type: defaultStreamMatch[1], id: defaultStreamMatch[2] } };
  }

  const configStreamMatch = CONFIG_STREAM_PATTERN.exec(pathname);
  if (configStreamMatch && configStreamMatch[1] && configStreamMatch[2] && configStreamMatch[3]) {
    return { type: "stream", params: { configStr: configStreamMatch[1], type: configStreamMatch[2], id: configStreamMatch[3] } };
  }

  return null;
}

function filterStreamsByConfig(streams: StremioStream[], config: UserConfig): StremioStream[] {
  let filtered = streams;

  if (config.resolutions && config.resolutions.length > 0) {
    const allowedRes = new Set(config.resolutions.map((r) => r.toLowerCase()));
    filtered = filtered.filter((stream) => {
      const titleLower = (stream.title ?? "").toLowerCase();
      const nameLower = (stream.name ?? "").toLowerCase();
      const text = `${nameLower} ${titleLower}`;

      if (allowedRes.has("4k") && (text.includes("4k") || text.includes("2160p") || text.includes("uhd"))) return true;
      if (allowedRes.has("1080p") && text.includes("1080p")) return true;
      if (allowedRes.has("720p") && text.includes("720p")) return true;
      if (allowedRes.has("480p") && (text.includes("480p") || text.includes("sd"))) return true;
      if (!text.includes("1080p") && !text.includes("720p") && !text.includes("4k") && !text.includes("2160p") && !text.includes("480p")) return true;

      return false;
    });
  }

  if (config.audioFilter === "ptbr_only") {
    filtered = filtered.filter((stream) => {
      const nameLower = (stream.name ?? "").toLowerCase();
      const text = `${nameLower} ${stream.title ?? ""}`.toLowerCase();
      const isNationalProvider = /bludv|comando|mico|torrent dos filmes|tdf|frost|fenix|king|brazuca/i.test(nameLower);
      if (isNationalProvider) return true;

      return (
        text.includes("dublado") ||
        text.includes("português") ||
        text.includes("portugues") ||
        text.includes("dual") ||
        text.includes("pt-br") ||
        text.includes("ptbr") ||
        text.includes("🇧🇷") ||
        text.includes("pt")
      );
    });
  } else if (config.audioFilter === "prefer_dual") {
    filtered.sort((a, b) => {
      const aDual = `${a.name} ${a.title}`.toLowerCase().includes("dual") ? 1 : 0;
      const bDual = `${b.name} ${b.title}`.toLowerCase().includes("dual") ? 1 : 0;
      return bDual - aDual;
    });
  }

  return filtered;
}

export async function routeRequest(
  method: string,
  pathname: string,
  streamService: StreamService = getDefaultStreamService(),
  hostUrl = "http://127.0.0.1:7000",
): Promise<RouteResult> {
  if (method !== "GET") {
    return { status: 404, body: { error: "Not found" } };
  }

  const parsed = parsePath(pathname);
  if (!parsed) {
    return { status: 404, body: { error: "Not found" } };
  }

  if (parsed.type === "configure") {
    return {
      status: 200,
      contentType: "text/html",
      html: renderConfigureHtml(hostUrl),
    };
  }

  if (parsed.type === "manifest") {
    return { status: 200, contentType: "application/json", body: getManifest(hostUrl) };
  }

  if (parsed.type === "stream") {
    const { configStr, type, id } = parsed.params;
    let activeStreamService = streamService;
    let userConfig: UserConfig | null = null;

    if (configStr) {
      userConfig = decodeUserConfig(configStr);
      if (userConfig) {
        const providerManager = createProviderManagerForConfig(userConfig);
        activeStreamService = new StreamService(providerManager);
      }
    }

    try {
      let streams = await activeStreamService.getStreams(type, id);
      if (userConfig) {
        streams = filterStreamsByConfig(streams, userConfig);
      }
      return { status: 200, contentType: "application/json", body: { streams } };
    } catch (error) {
      if (error instanceof StreamRequestError) {
        return { status: 400, body: { error: error.message } };
      }

      return { status: 500, body: { error: "Internal server error" } };
    }
  }

  return { status: 404, body: { error: "Not found" } };
}
