import { createExperimentalRealDebridAddonRuntime } from "../../../src/runtime/experimentalRealDebridAddonRuntime.js";
import { createExperimentalAddonHttpServer } from "../../../src/runtime/experimental/experimentalAddonHttpServer.js";
import type { DataClient } from "../../../src/types/dataClient.js";
import type { Parser } from "../../../src/types/parser.js";
import type { TorrentIndexerRawResponse, TorrentIndexerRequest, TorrentIndexerResponse } from "../../../src/providers/torrentIndexer/torrentIndexerTypes.js";

const client: DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse> = { async fetch() { return { results: [] }; } };
const parser: Parser<TorrentIndexerRawResponse, TorrentIndexerResponse> = { parse: () => ({ items: [] }) };
const port = Number(process.env.EXPERIMENTAL_ADDON_HTTP_PORT ?? "7007");
const runtime = createExperimentalRealDebridAddonRuntime({ enabled: false, source: { indexer: "runtime-lab" } }, { client, parser });
createExperimentalAddonHttpServer({ bind: "127.0.0.1", port, runtime });
