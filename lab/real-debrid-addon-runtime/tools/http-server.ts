import { createExperimentalRealDebridAddonRuntime } from "../../../src/runtime/experimentalRealDebridAddonRuntime.js";
import { createExperimentalAddonHttpServer } from "../../../src/runtime/experimental/experimentalAddonHttpServer.js";
import type { DataClient } from "../../../src/types/dataClient.js";
import type { Parser } from "../../../src/types/parser.js";
import type { TorrentIndexerRawResponse, TorrentIndexerRequest, TorrentIndexerResponse } from "../../../src/providers/torrentIndexer/torrentIndexerTypes.js";

const client: DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse> = { async fetch() { return { results: [] }; } };
const parser: Parser<TorrentIndexerRawResponse, TorrentIndexerResponse> = { parse: () => ({ items: [] }) };

process.stdout.write("EXPERIMENTAL_HTTP_STARTING\n");

try {
  const port = Number(process.env.EXPERIMENTAL_ADDON_HTTP_PORT ?? "7007");
  const bind = process.env.EXPERIMENTAL_ADDON_HTTP_HOST ?? "127.0.0.1";
  if ((bind !== "127.0.0.1" && bind !== "0.0.0.0") || port !== 7007) {
    throw new Error("invalid experimental HTTP configuration");
  }
  const runtime = createExperimentalRealDebridAddonRuntime({ enabled: false, source: { indexer: "runtime-lab" } }, { client, parser });
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
