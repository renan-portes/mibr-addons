import type { StreamProvider, StreamQuery } from "../../types/streamProvider.js";
import type { StreamResult } from "../../types/streamResult.js";
import type { NovaStreamsClient } from "./novaStreamsClient.js";
import type { NovaStreamsParser } from "./novaStreamsParser.js";

export interface NovaStreamsProviderOptions {
  client: NovaStreamsClient;
  parser: NovaStreamsParser;
}

export class NovaStreamsProvider implements StreamProvider {
  readonly id = "nova-streams";
  readonly name = "Nova Streams";

  private readonly client: NovaStreamsClient;
  private readonly parser: NovaStreamsParser;

  constructor(options: NovaStreamsProviderOptions) {
    this.client = options.client;
    this.parser = options.parser;
  }

  async getStreams(query: StreamQuery, signal: AbortSignal): Promise<StreamResult[]> {
    if (!query.id || !query.id.startsWith("tt")) {
      return [];
    }

    try {
      const raw = await this.client.fetch(query, signal);
      return this.parser.parse(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[nova-streams] Provider error: ${msg}`);
      return [];
    }
  }
}
