import type { DataClient } from "../../types/dataClient.js";
import type { Parser } from "../../types/parser.js";
import { createRealDebridProviderWiring, type RealDebridProviderWiringConfig, type RealDebridProviderWiringDependencies } from "../torrentIndexer/realDebridProviderWiring.js";
import { ComandoProvider } from "./comandoProvider.js";
import type { ComandoRawResponse, ComandoRequest, ComandoResponse } from "./comandoTypes.js";

export function createRealDebridComandoProvider(
  client: DataClient<ComandoRequest, ComandoRawResponse>,
  parser: Parser<ComandoRawResponse, ComandoResponse>,
  config: RealDebridProviderWiringConfig,
  dependencies: RealDebridProviderWiringDependencies = {},
): ComandoProvider {
  const wiring = createRealDebridProviderWiring(config, dependencies);
  return new ComandoProvider({
    client,
    parser,
    resolver: wiring.resolver,
  });
}
