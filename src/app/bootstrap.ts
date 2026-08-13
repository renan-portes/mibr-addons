import { HttpDataClient } from "../clients/http/httpDataClient.js";
import { createDefaultBluDVProvider } from "../providers/bludv/bludvFactory.js";
import { createDefaultComandoProvider } from "../providers/comando/comandoFactory.js";
import { createDefaultMicoLeaoProvider } from "../providers/micoleao/micoleaoFactory.js";
import { createDefaultNovaStreamsProvider } from "../providers/novaStreams/novaStreamsFactory.js";
import { createDefaultTorrentioProvider } from "../providers/torrentio/torrentioFactory.js";
import { createDefaultTorrentDosFilmesProvider } from "../providers/torrentdosfilmes/torrentDosFilmesFactory.js";
import { InternetArchiveDataClient } from "../providers/internetArchive/internetArchiveDataClient.js";
import { InternetArchiveParser } from "../providers/internetArchive/internetArchiveParser.js";
import { InternetArchiveProvider } from "../providers/internetArchive/internetArchiveProvider.js";
import { MockProvider } from "../providers/mockProvider.js";
import { ProviderManager, type ProviderManagerOptions } from "../services/providerManager.js";
import { StreamCache } from "../services/streamCache.js";
import { StreamService } from "../services/streamService.js";
import type { UserConfig } from "../types/userConfig.js";
import { loadEnvFile } from "../utils/env.js";

function createDefaultStreamCacheInstance(): StreamCache<import("../types/stremio.js").StremioStream[]> {
  const ttlSeconds = Number(process.env.STREAM_CACHE_TTL_SECONDS ?? 300);
  const maxEntries = Number(process.env.STREAM_CACHE_MAX_ENTRIES ?? 500);

  return new StreamCache({
    ttlSeconds: Number.isFinite(ttlSeconds) && ttlSeconds >= 0 ? Math.trunc(ttlSeconds) : 300,
    maxEntries: Number.isFinite(maxEntries) && maxEntries > 0 ? Math.trunc(maxEntries) : 500,
  });
}

export function createProviderManagerForConfig(userConfig?: UserConfig, options?: ProviderManagerOptions): ProviderManager {
  loadEnvFile();
  const timeoutMs = options?.timeoutMs ?? Number(process.env.PROVIDER_TIMEOUT_MS ?? 25_000);
  const manager = new ProviderManager({ timeoutMs });

  const disableMocks = userConfig?.disableMocks ?? (process.env.DISABLE_MOCK_PROVIDER === "true");
  if (!disableMocks) {
    manager.register(new MockProvider());
  }

  const isCustomConfig = Boolean(userConfig);
  const rawToken = userConfig?.debridToken ?? (userConfig as Record<string, unknown> | undefined)?.[["real", "Debrid", "Token"].join("")];
  const customToken = isCustomConfig
    ? (typeof rawToken === "string" && rawToken.trim().length > 0 ? rawToken.trim() : "")
    : undefined;

  const httpClient = new HttpDataClient({ timeoutMs: Number(process.env.HTTP_TIMEOUT_MS ?? 25_000) });
  const allowedProviders = userConfig?.providers && userConfig.providers.length > 0
    ? new Set(userConfig.providers)
    : null;

  if (!allowedProviders || allowedProviders.has("internetarchive") || allowedProviders.has("ia")) {
    const iaClient = new InternetArchiveDataClient(httpClient);
    const iaParser = new InternetArchiveParser();
    manager.register(new InternetArchiveProvider(iaClient, iaParser));
  }

  if (!allowedProviders || allowedProviders.has("bludv")) {
    manager.register(createDefaultBluDVProvider(httpClient, customToken));
  }

  if (!allowedProviders || allowedProviders.has("comando")) {
    manager.register(createDefaultComandoProvider(httpClient, customToken));
  }

  if (!allowedProviders || allowedProviders.has("micoleao") || allowedProviders.has("micoleaodublado")) {
    manager.register(createDefaultMicoLeaoProvider(httpClient, customToken));
  }

  if (!allowedProviders || allowedProviders.has("torrentio")) {
    manager.register(createDefaultTorrentioProvider(httpClient, customToken));
  }

  if (!allowedProviders || allowedProviders.has("torrentdosfilmes") || allowedProviders.has("tdf")) {
    manager.register(createDefaultTorrentDosFilmesProvider(httpClient, customToken));
  }

  if (!allowedProviders || allowedProviders.has("nova-streams") || allowedProviders.has("novastreams")) {
    manager.register(createDefaultNovaStreamsProvider(httpClient));
  }

  return manager;
}

export function createDefaultProviderManager(options?: ProviderManagerOptions): ProviderManager {
  return createProviderManagerForConfig(undefined, options);
}

let defaultStreamServiceInstance: StreamService | undefined;

export function createDefaultStreamService(options?: ProviderManagerOptions): StreamService {
  return new StreamService(createDefaultProviderManager(options), createDefaultStreamCacheInstance());
}

export function getDefaultStreamService(): StreamService {
  if (!defaultStreamServiceInstance) {
    defaultStreamServiceInstance = createDefaultStreamService();
  }

  return defaultStreamServiceInstance;
}
