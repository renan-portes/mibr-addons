import type { DataClient } from "../../types/dataClient.js";
import type { Parser } from "../../types/parser.js";
import { createRealDebridProviderWiring, type RealDebridProviderWiringConfig, type RealDebridProviderWiringDependencies } from "../torrentIndexer/realDebridProviderWiring.js";
import { MicoLeaoProvider } from "./micoleaoProvider.js";
import type { MicoLeaoRawResponse, MicoLeaoRequest, MicoLeaoResponse } from "./micoleaoTypes.js";

export function createRealDebridMicoLeaoProvider(
  client: DataClient<MicoLeaoRequest, MicoLeaoRawResponse>,
  parser: Parser<MicoLeaoRawResponse, MicoLeaoResponse>,
  config: RealDebridProviderWiringConfig,
  dependencies: RealDebridProviderWiringDependencies = {},
): MicoLeaoProvider {
  const wiring = createRealDebridProviderWiring(config, dependencies);
  return new MicoLeaoProvider({
    client,
    parser,
    resolver: wiring.resolver,
  });
}
