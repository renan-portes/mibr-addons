import { getManifest } from "../addon/manifest.js";
import { getStreams, StreamRequestError } from "../services/streamService.js";
import type { ErrorResponse, StremioStreamResponse } from "../types/stremio.js";

export type RouteResult =
  | { status: 200; body: ReturnType<typeof getManifest> | StremioStreamResponse }
  | { status: 400; body: ErrorResponse }
  | { status: 404; body: ErrorResponse }
  | { status: 500; body: ErrorResponse };

const STREAM_PATH_PATTERN = /^\/stream\/([^/]+)\/([^/]+)\.json$/;

function parseStreamPath(pathname: string): { type: string; id: string } | null {
  const match = STREAM_PATH_PATTERN.exec(pathname);

  if (!match) {
    return null;
  }

  const type = match[1];
  const id = match[2];

  if (!type || !id) {
    return null;
  }

  return { type, id };
}

export function routeRequest(method: string, pathname: string): RouteResult {
  if (method !== "GET") {
    return { status: 404, body: { error: "Not found" } };
  }

  if (pathname === "/manifest.json") {
    return { status: 200, body: getManifest() };
  }

  const streamParams = parseStreamPath(pathname);

  if (streamParams) {
    try {
      const streams = getStreams(streamParams.type, streamParams.id);
      return { status: 200, body: { streams } };
    } catch (error) {
      if (error instanceof StreamRequestError) {
        return { status: 400, body: { error: error.message } };
      }

      return { status: 500, body: { error: "Internal server error" } };
    }
  }

  return { status: 404, body: { error: "Not found" } };
}
