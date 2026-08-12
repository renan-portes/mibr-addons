import { HttpDataClient } from "../clients/http/httpDataClient.js";
import { BluDVClient } from "../providers/bludv/bludvClient.js";
import { BluDVParser } from "../providers/bludv/bludvParser.js";
import { BluDVProvider } from "../providers/bludv/bludvProvider.js";
import { InternetArchiveDataClient } from "../providers/internetArchive/internetArchiveDataClient.js";
import { InternetArchiveParser } from "../providers/internetArchive/internetArchiveParser.js";
import { InternetArchiveProvider } from "../providers/internetArchive/internetArchiveProvider.js";
import { MockProvider } from "../providers/mockProvider.js";
import { ProviderManager, type ProviderManagerOptions } from "../services/providerManager.js";
import { StreamService } from "../services/streamService.js";

export function createDefaultProviderManager(options?: ProviderManagerOptions): ProviderManager {
  const manager = new ProviderManager(options);
  manager.register(new MockProvider());

  const httpClient = new HttpDataClient();
  const iaClient = new InternetArchiveDataClient(httpClient);
  const iaParser = new InternetArchiveParser();
  manager.register(new InternetArchiveProvider(iaClient, iaParser));

  const bludvBaseUrl = process.env.BLUDV_BASE_URL;
  if (bludvBaseUrl) {
    const bludvClient = new BluDVClient(httpClient, { baseUrl: bludvBaseUrl });
    const bludvParser = new BluDVParser();
    manager.register(new BluDVProvider({ client: bludvClient, parser: bludvParser }));
  }

  return manager;
}

export function createDefaultStreamService(options?: ProviderManagerOptions): StreamService {
  return new StreamService(createDefaultProviderManager(options));
}

const defaultStreamService = createDefaultStreamService();

export function getDefaultStreamService(): StreamService {
  return defaultStreamService;
}

export async function getStreams(type: string, id: string) {
  return defaultStreamService.getStreams(type, id);
}
