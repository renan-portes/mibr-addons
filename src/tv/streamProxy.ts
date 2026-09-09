import type { ChannelStore } from "./channelStore.js";

export interface ProxyStreamResult {
  readonly status: number;
  readonly contentType: string;
  readonly body?: string | Buffer | Uint8Array;
  readonly stream?: NodeJS.ReadableStream | Response;
  readonly headers?: Record<string, string>;
}

export function rewriteM3u8Playlist(
  content: string,
  originUrl: string,
  proxyBaseUrl: string
): string {
  const originBase = originUrl.substring(0, originUrl.lastIndexOf("/") + 1);
  const lines = content.split(/\r?\n/);
  const rewrittenLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line) {
      rewrittenLines.push(line);
      continue;
    }

    // Handle URI attributes in tags, e.g. #EXT-X-KEY:METHOD=AES-128,URI="http://..."
    if (line.startsWith("#")) {
      const uriMatch = line.match(/URI=["']([^"']+)["']/);
      if (uriMatch && uriMatch[0] && uriMatch[1]) {
        const fullUri = resolveUrl(uriMatch[1], originBase);
        const proxiedUri = `${proxyBaseUrl}/proxy/segment?url=${encodeURIComponent(fullUri)}`;
        rewrittenLines.push(line.replace(uriMatch[0], `URI="${proxiedUri}"`));
      } else {
        rewrittenLines.push(line);
      }
      continue;
    }

    // Line is a URI (subplaylist or chunk)
    const fullChunkUrl = resolveUrl(line, originBase);
    const proxiedChunk = `${proxyBaseUrl}/proxy/segment?url=${encodeURIComponent(fullChunkUrl)}`;
    rewrittenLines.push(proxiedChunk);
  }

  return rewrittenLines.join("\n");
}

function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

export function normalizeTargetUrl(url: string): string {
  const override = process.env.UPSTREAM_HOST_OVERRIDE;
  if (override) {
    return url.replace("127.0.0.1:11470", override).replace("localhost:11470", override);
  }
  return url;
}

export class StreamProxy {
  constructor(private readonly channelStore: ChannelStore) {}

  async handleStreamPlaylist(
    channelId: string,
    proxyBaseUrl: string,
    signal?: AbortSignal
  ): Promise<ProxyStreamResult> {
    const channel = this.channelStore.getChannelById(channelId);
    if (!channel) {
      return { status: 404, contentType: "text/plain", body: "Channel not found" };
    }

    try {
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...(channel.httpHeaders ?? {}),
      };

      const targetUrl = normalizeTargetUrl(channel.streamUrl);
      const response = await fetch(targetUrl, {
        method: "GET",
        headers,
        signal,
      });

      if (!response.ok) {
        return {
          status: response.status,
          contentType: "text/plain",
          body: `Upstream error: ${response.statusText}`,
        };
      }

      const contentType = response.headers.get("content-type") || "application/vnd.apple.mpegurl";
      const text = await response.text();

      // Check if it's an M3U8 playlist
      if (text.startsWith("#EXTM3U") || text.includes("#EXTINF") || contentType.includes("mpegurl")) {
        const rewritten = rewriteM3u8Playlist(text, channel.streamUrl, proxyBaseUrl);
        return {
          status: 200,
          contentType: "application/vnd.apple.mpegurl; charset=utf-8",
          body: rewritten,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache, no-store, must-revalidate",
          },
        };
      }

      // If not M3U8 (e.g. direct TS stream), return as is
      return {
        status: 200,
        contentType,
        body: text,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { status: 502, contentType: "text/plain", body: `Proxy error: ${msg}` };
    }
  }

  async handleSegment(
    targetUrl: string,
    signal?: AbortSignal
  ): Promise<ProxyStreamResult> {
    try {
      const decodedUrl = decodeURIComponent(targetUrl);
      const normalizedUrl = normalizeTargetUrl(decodedUrl);
      const response = await fetch(normalizedUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal,
      });

      if (!response.ok) {
        return {
          status: response.status,
          contentType: "text/plain",
          body: `Segment fetch failed: ${response.statusText}`,
        };
      }

      const contentType = response.headers.get("content-type") || "video/mp2t";
      const arrayBuffer = await response.arrayBuffer();

      return {
        status: 200,
        contentType,
        body: Buffer.from(arrayBuffer),
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600",
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { status: 502, contentType: "text/plain", body: `Segment proxy error: ${msg}` };
    }
  }
}
