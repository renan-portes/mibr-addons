import { createExperimentalRealDebridAddonRuntime } from "../../../src/runtime/experimentalRealDebridAddonRuntime.js";
import { createExperimentalAddonHttpServer } from "../../../src/runtime/experimental/experimentalAddonHttpServer.js";
import { createExperimentalRealDebridClientMode } from "../../../src/runtime/experimental/experimentalRealDebridClientMode.js";
import type { DataClient } from "../../../src/types/dataClient.js";
import type { Parser } from "../../../src/types/parser.js";
import type { TorrentIndexerRawResponse, TorrentIndexerRequest, TorrentIndexerResponse } from "../../../src/providers/torrentIndexer/torrentIndexerTypes.js";

let candidates: readonly { readonly imdbId: string; readonly magnet: string; readonly infoHash: string; readonly filePath: string; readonly fileBytes: number }[] = [];
const client: DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse> = { async fetch() { return undefined; } };
const parser: Parser<TorrentIndexerRawResponse, TorrentIndexerResponse> = { parse: () => ({ items: candidates.map((candidate) => ({ title: "Authorized experimental candidate", imdb: candidate.imdbId, magnet: candidate.magnet, infoHash: candidate.infoHash, audio: [], trackers: [], files: [{ path: candidate.filePath, size: String(candidate.fileBytes) }], peers: { seeders: 0, leechers: 0 } })) }) };

process.stdout.write("EXPERIMENTAL_HTTP_STARTING\n");

try {
  const port = Number(process.env.EXPERIMENTAL_ADDON_HTTP_PORT ?? "7007");
  const bind = process.env.EXPERIMENTAL_ADDON_HTTP_HOST ?? "127.0.0.1";
  if ((bind !== "127.0.0.1" && bind !== "0.0.0.0") || port !== 7007) {
    throw new Error("invalid experimental HTTP configuration");
  }
  const mode = createExperimentalRealDebridClientMode(process.env);
  candidates = mode.candidates;
  const runtime = createExperimentalRealDebridAddonRuntime({ enabled: mode.enabled, token: mode.token, authorizedImdbIds: mode.authorizedImdbIds, source: { indexer: "runtime-lab" } }, { client, parser });
  if (mode.enabled) process.stdout.write("REAL_DEBRID_MODE_ENABLED\n");
  const marker = (value: string) => process.stdout.write(`${value}\n`);
  const server = createExperimentalAddonHttpServer({ bind, port, runtime, marker });
  server.once("listening", () => process.stdout.write("EXPERIMENTAL_HTTP_LISTENING\n"));
  server.once("error", () => {
    process.stderr.write("EXPERIMENTAL_HTTP_RUNTIME_ERROR\n");
    process.exitCode = 1;
  });
} catch {
  process.stderr.write("EXPERIMENTAL_HTTP_CONFIGURATION_ERROR\n");
  process.exitCode = 1;
}
