import type { StreamProvider, StreamQuery } from "../types/streamProvider.js";
import type { StremioStream } from "../types/stremio.js";

export class ProviderManager {
  private readonly providers = new Map<string, StreamProvider>();

  register(provider: StreamProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider already registered: ${provider.id}`);
    }

    this.providers.set(provider.id, provider);
  }

  get(id: string): StreamProvider | undefined {
    return this.providers.get(id);
  }

  list(): StreamProvider[] {
    return [...this.providers.values()];
  }

  async getStreamsFromAll(query: StreamQuery): Promise<StremioStream[]> {
    const providerResults = await Promise.all(
      this.list().map((provider) => this.getStreamsSafely(provider, query)),
    );

    return providerResults.flat();
  }

  private async getStreamsSafely(
    provider: StreamProvider,
    query: StreamQuery,
  ): Promise<StremioStream[]> {
    try {
      return await provider.getStreams(query);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Provider "${provider.id}" failed: ${message}`);
      return [];
    }
  }
}
