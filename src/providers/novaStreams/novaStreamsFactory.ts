import type { HttpDataClient } from "../../clients/http/httpDataClient.js";
import { NovaStreamsClient } from "./novaStreamsClient.js";
import { NovaStreamsParser } from "./novaStreamsParser.js";
import { NovaStreamsProvider } from "./novaStreamsProvider.js";

export function createDefaultNovaStreamsProvider(httpClient: HttpDataClient): NovaStreamsProvider {
  const baseUrl = process.env.NOVA_STREAMS_BASE_URL || "https://nova-streamz.vercel.app";
  const client = new NovaStreamsClient(httpClient, { baseUrl });
  const parser = new NovaStreamsParser();
  return new NovaStreamsProvider({ client, parser });
}
