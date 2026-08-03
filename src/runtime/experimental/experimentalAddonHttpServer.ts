import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { toStremioStreams } from "../../adapters/stremioStreamAdapter.js";
import type { ExperimentalRealDebridAddonRuntime } from "../experimentalRealDebridAddonRuntime.js";
import { getExperimentalAddonManifest } from "./experimentalAddonManifest.js";

const MAX_URL_LENGTH = 2048;
const REQUEST_TIMEOUT_MS = 5_000;
const STREAM = /^\/stream\/(movie|series)\/(tt[0-9]{1,12})\.json$/;
const HEADERS = Object.freeze({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });

export type ExperimentalAddonHttpServerOptions = Readonly<{ bind?: string; port?: number; runtime: ExperimentalRealDebridAddonRuntime }>;

function send(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, HEADERS);
  response.end(JSON.stringify(body));
}

function validOptions(options: ExperimentalAddonHttpServerOptions): { bind: string; port: number } {
  const bind = options.bind ?? "127.0.0.1";
  const port = options.port ?? 0;
  if (bind !== "127.0.0.1" || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Experimental HTTP runtime rejected (invalid_configuration)");
  return { bind, port };
}

async function route(request: IncomingMessage, response: ServerResponse, runtime: ExperimentalRealDebridAddonRuntime): Promise<void> {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed" });
  if (!request.url || request.url.length > MAX_URL_LENGTH) return send(response, 404, { error: "Not found" });
  const pathname = request.url.split("?", 1)[0] ?? "";
  if (pathname === "/health") return send(response, 200, { status: "ok" });
  if (pathname === "/manifest.json") return send(response, 200, getExperimentalAddonManifest());
  const match = STREAM.exec(pathname);
  if (!match) return send(response, 404, { error: "Not found" });
  const type = match[1];
  const id = match[2];
  if (!type || !id) return send(response, 404, { error: "Not found" });

  const controller = new AbortController();
  const cancel = () => controller.abort(new DOMException("client disconnected", "AbortError"));
  request.once("aborted", cancel);
  response.once("close", cancel);
  const timer = setTimeout(() => controller.abort(new DOMException("request timed out", "TimeoutError")), REQUEST_TIMEOUT_MS);
  try {
    const streams = await runtime.provider.getStreams({ type: type as "movie" | "series", id }, controller.signal);
    if (!controller.signal.aborted) send(response, 200, { streams: toStremioStreams(streams) });
  } catch {
    if (!response.writableEnded) send(response, 500, { error: "Internal server error" });
  } finally {
    clearTimeout(timer);
    request.removeListener("aborted", cancel);
    response.removeListener("close", cancel);
  }
}

export function createExperimentalAddonHttpServer(options: ExperimentalAddonHttpServerOptions): Server {
  const { bind, port } = validOptions(options);
  return createServer((request, response) => { void route(request, response, options.runtime); }).listen(port, bind);
}
