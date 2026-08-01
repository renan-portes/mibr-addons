import type { StreamProvider, StreamQuery } from "../types/streamProvider.js";
import type { StreamResult } from "../types/streamResult.js";

const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;

export interface ProviderManagerOptions {
  timeoutMs?: number;
}

export class ProviderManager {
  private readonly providers = new Map<string, StreamProvider>();
  private readonly timeoutMs: number;

  constructor(options: ProviderManagerOptions = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;

    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error(`Invalid provider timeout: ${timeoutMs}`);
    }

    this.timeoutMs = timeoutMs;
  }

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

  async getStreamsFromAll(query: StreamQuery): Promise<StreamResult[]> {
    const providerResults = await Promise.all(
      this.list().map((provider) => this.getStreamsSafely(provider, query)),
    );

    return providerResults.flat();
  }

  private async getStreamsSafely(
    provider: StreamProvider,
    query: StreamQuery,
  ): Promise<StreamResult[]> {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          controller.abort();
          reject(new Error(`timed out after ${this.timeoutMs}ms`));
        }, this.timeoutMs);
      });

      return await Promise.race([provider.getStreams(query, controller.signal), timeout]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Provider "${provider.id}" failed: ${message}`);
      return [];
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
