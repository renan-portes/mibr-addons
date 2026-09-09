import { fileURLToPath } from "node:url";
import { createAddonServer } from "./server/httpServer.js";
import { getPort, loadEnvFile } from "./utils/env.js";
import { getDefaultChannelStore } from "./tv/channelStore.js";

export { getManifest, manifest } from "./addon/manifest.js";
export { ChannelStore, getDefaultChannelStore } from "./tv/channelStore.js";
export { parseM3U } from "./tv/m3uParser.js";
export { StreamProxy, rewriteM3u8Playlist } from "./tv/streamProxy.js";
export type { TvChannel, TvCatalogFilter } from "./tv/types.js";
export { createAddonServer, getServerAddress, startAddonServer } from "./server/httpServer.js";
export { routeRequest } from "./server/router.js";
export { getPort } from "./utils/env.js";

export function main(): void {
  loadEnvFile();
  const port = getPort();
  const server = createAddonServer();

  // Pre-load channels
  const store = getDefaultChannelStore();
  const stats = store.getStats();

  server.listen(port, () => {
    console.log(`MIBR TV 🇧🇷 listening on http://127.0.0.1:${port}`);
    console.log(`Manifest: http://127.0.0.1:${port}/manifest.json`);
    console.log(`Configurator: http://127.0.0.1:${port}/configure`);
    console.log(`Channels loaded: ${stats.totalChannels} across ${Object.keys(stats.genres).length} categories`);
  });

  server.on("error", (error) => {
    console.error("Failed to start server:", error.message);
    process.exitCode = 1;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
