import type { Parser } from "../../types/parser.js";
import { createRealDebridProviderWiring, type RealDebridProviderWiringConfig, type RealDebridProviderWiringDependencies } from "../torrentIndexer/realDebridProviderWiring.js";
import type { TorrentioClient } from "./torrentioClient.js";
import { TorrentioProvider } from "./torrentioProvider.js";
import type { TorrentioRawResponse, TorrentioResponse } from "./torrentioTypes.js";

export function createRealDebridTorrentioProvider(
  client: TorrentioClient,
  parser: Parser<TorrentioRawResponse, TorrentioResponse>,
  config: RealDebridProviderWiringConfig,
  dependencies: RealDebridProviderWiringDependencies = {},
): TorrentioProvider {
  const wiring = createRealDebridProviderWiring(config, dependencies);
  return new TorrentioProvider({
    client,
    parser,
    resolver: wiring.resolver,
  });
}
