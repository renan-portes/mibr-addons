import { MockProvider } from "../providers/mockProvider.js";
import { ProviderManager, type ProviderManagerOptions } from "../services/providerManager.js";
import { StreamService } from "../services/streamService.js";

export function createDefaultProviderManager(options?: ProviderManagerOptions): ProviderManager {
  const manager = new ProviderManager(options);
  manager.register(new MockProvider());
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
