import type { DataClient } from "../../types/dataClient.js";
import type { Parser } from "../../types/parser.js";
import { createRealDebridProviderWiring, type RealDebridProviderWiringConfig, type RealDebridProviderWiringDependencies } from "../torrentIndexer/realDebridProviderWiring.js";
import { TorrentDosFilmesProvider } from "./torrentDosFilmesProvider.js";
import type { TorrentDosFilmesRawResponse, TorrentDosFilmesRequest, TorrentDosFilmesResponse } from "./torrentDosFilmesTypes.js";

export function createRealDebridTorrentDosFilmesProvider(
  client: DataClient<TorrentDosFilmesRequest, TorrentDosFilmesRawResponse>,
  parser: Parser<TorrentDosFilmesRawResponse, TorrentDosFilmesResponse>,
  config: RealDebridProviderWiringConfig,
  dependencies: RealDebridProviderWiringDependencies = {},
): TorrentDosFilmesProvider {
  const wiring = createRealDebridProviderWiring(config, dependencies);
  return new TorrentDosFilmesProvider({
    client: client as any,
    parser: parser as any,
    resolver: wiring.resolver,
  });
}
