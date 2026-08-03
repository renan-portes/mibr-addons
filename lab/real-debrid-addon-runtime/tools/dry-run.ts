import { createExperimentalRealDebridAddonRuntime } from "../../../src/runtime/experimentalRealDebridAddonRuntime.js";
import type { DataClient } from "../../../src/types/dataClient.js";
import type { Parser } from "../../../src/types/parser.js";
import type { TorrentIndexerRawResponse, TorrentIndexerRequest, TorrentIndexerResponse } from "../../../src/providers/torrentIndexer/torrentIndexerTypes.js";

const client: DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse> = {
  async fetch() { return { results: [] }; },
};
const parser: Parser<TorrentIndexerRawResponse, TorrentIndexerResponse> = { parse: () => ({ items: [] }) };
const enabled = process.env.REAL_DEBRID_ADDON_RUNTIME_ENABLED === "true";

// Dry-run deliberately never reads the token file or constructs enabled wiring.
createExperimentalRealDebridAddonRuntime({ enabled: false, source: { indexer: "runtime-lab" } }, { client, parser });
console.log(JSON.stringify({ status: "DRY_RUN_OK", enabledRequested: enabled ? "SIM" : "NAO" }));
