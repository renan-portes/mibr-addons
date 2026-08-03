import type { DataClient } from "../../types/dataClient.js";
import type { Parser } from "../../types/parser.js";
import { RealDebridApiClient, type RealDebridHttpTransport } from "./realDebridApiClient.js";
import { RealDebridCandidateResolver, type RealDebridResolverOptions } from "./realDebridCandidateResolver.js";
import { RealDebridFetchTransport } from "./realDebridFetchTransport.js";
import type { TorrentCandidateResolver } from "./torrentCandidateResolver.js";
import { TorrentIndexerProvider, type TorrentIndexerResolutionOptions } from "./torrentIndexerProvider.js";
import type { TorrentIndexerRawResponse, TorrentIndexerRequest, TorrentIndexerResponse, TorrentIndexerSource } from "./torrentIndexerTypes.js";

export type RealDebridProviderWiringConfig =
  | Readonly<{ enabled: false }>
  | Readonly<{
      enabled: true;
      token: string;
      transportTimeoutMs?: number;
      pollAttempts?: number;
      totalTimeoutMs?: number;
      cleanupTimeoutMs?: number;
      candidateLimit?: number;
      resolverTimeoutMs?: number;
    }>;

export class RealDebridProviderWiringError extends Error {
  readonly code = "invalid_configuration";
  constructor() {
    super("Real-Debrid provider wiring rejected (invalid_configuration)");
    this.name = "RealDebridProviderWiringError";
  }
}

export interface RealDebridProviderWiringDependencies {
  readonly createTransport?: (timeoutMs: number | undefined) => RealDebridHttpTransport;
  readonly createApiClient?: (transport: RealDebridHttpTransport, token: string) => RealDebridApiClient;
  readonly createResolver?: (api: RealDebridApiClient, options: RealDebridResolverOptions) => TorrentCandidateResolver;
}

export interface RealDebridProviderWiring {
  readonly resolver?: TorrentCandidateResolver;
  readonly resolution: TorrentIndexerResolutionOptions;
}

function optionalInteger(value: number | undefined, maximum: number): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > maximum)) {
    throw new RealDebridProviderWiringError();
  }
}

function validateEnabled(config: Extract<RealDebridProviderWiringConfig, { enabled: true }>): void {
  if (typeof config.token !== "string" || config.token.trim().length === 0 || config.token.length > 4_096
    || /[\u0000-\u001f\u007f]/.test(config.token)) throw new RealDebridProviderWiringError();
  optionalInteger(config.transportTimeoutMs, 60_000);
  optionalInteger(config.pollAttempts, 20);
  optionalInteger(config.totalTimeoutMs, 60_000);
  optionalInteger(config.cleanupTimeoutMs, 5_000);
  optionalInteger(config.candidateLimit, 10);
  optionalInteger(config.resolverTimeoutMs, 60_000);
}

export function createRealDebridProviderWiring(
  config: RealDebridProviderWiringConfig,
  dependencies: RealDebridProviderWiringDependencies = {},
): RealDebridProviderWiring {
  if (config.enabled === false) return Object.freeze({ resolution: Object.freeze({ enabled: false }) });
  if (config.enabled !== true) throw new RealDebridProviderWiringError();
  validateEnabled(config);

  try {
    const transport = (dependencies.createTransport ?? ((timeoutMs) => new RealDebridFetchTransport(
      timeoutMs === undefined ? {} : { timeoutMs },
    )))(config.transportTimeoutMs);
    const api = (dependencies.createApiClient ?? ((value, token) => new RealDebridApiClient(value, token)))(transport, config.token);
    const resolver = (dependencies.createResolver ?? ((value, options) => new RealDebridCandidateResolver(value, options)))(api, Object.freeze({
      ...(config.pollAttempts === undefined ? {} : { pollAttempts: config.pollAttempts }),
      ...(config.totalTimeoutMs === undefined ? {} : { totalTimeoutMs: config.totalTimeoutMs }),
      ...(config.cleanupTimeoutMs === undefined ? {} : { cleanupTimeoutMs: config.cleanupTimeoutMs }),
    }));
    return Object.freeze({ resolver, resolution: Object.freeze({ enabled: true,
      ...(config.candidateLimit === undefined ? {} : { candidateLimit: config.candidateLimit }),
      ...(config.resolverTimeoutMs === undefined ? {} : { timeoutMs: config.resolverTimeoutMs }) }) });
  } catch {
    throw new RealDebridProviderWiringError();
  }
}

export function createRealDebridTorrentIndexerProvider(
  client: DataClient<TorrentIndexerRequest, TorrentIndexerRawResponse>,
  parser: Parser<TorrentIndexerRawResponse, TorrentIndexerResponse>,
  source: TorrentIndexerSource,
  config: RealDebridProviderWiringConfig,
  dependencies: RealDebridProviderWiringDependencies = {},
): TorrentIndexerProvider {
  const wiring = createRealDebridProviderWiring(config, dependencies);
  return new TorrentIndexerProvider(client, parser, source, wiring.resolver, wiring.resolution);
}
