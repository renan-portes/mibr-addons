import { fileURLToPath } from "node:url";
import { createAddonServer } from "./server/httpServer.js";
import { getPort, loadEnvFile } from "./utils/env.js";

export { getManifest } from "./addon/manifest.js";
export {
  createDefaultProviderManager,
  createDefaultStreamService,
  getDefaultStreamService,
  getStreams,
} from "./app/bootstrap.js";
export { MockProvider } from "./providers/mockProvider.js";
export { ProviderManager } from "./services/providerManager.js";
export type { ProviderManagerOptions } from "./services/providerManager.js";
export { StreamService } from "./services/streamService.js";
export { createAddonServer, getServerAddress, startAddonServer } from "./server/httpServer.js";
export { routeRequest } from "./server/router.js";
export { getPort } from "./utils/env.js";
export type { MediaType } from "./types/mediaType.js";
export type { StreamProvider, StreamQuery } from "./types/streamProvider.js";
export type { StreamResult } from "./types/streamResult.js";
export type { DataClient } from "./types/dataClient.js";
export type { Parser } from "./types/parser.js";
export { BluDVClient } from "./providers/bludv/bludvClient.js";
export { BluDVParser } from "./providers/bludv/bludvParser.js";
export { BluDVProvider } from "./providers/bludv/bludvProvider.js";
export { createRealDebridBluDVProvider } from "./providers/bludv/realDebridBluDVWiring.js";
export type { BluDVItem, BluDVRawResponse, BluDVRequest, BluDVResponse } from "./providers/bludv/bludvTypes.js";

export function main(): void {
  loadEnvFile();
  const port = getPort();
  const server = createAddonServer();

  server.listen(port, () => {
    console.log(`MIBR Addons listening on http://127.0.0.1:${port}`);
    console.log(`Manifest: http://127.0.0.1:${port}/manifest.json`);
  });

  server.on("error", (error) => {
    console.error("Failed to start server:", error.message);
    process.exitCode = 1;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
