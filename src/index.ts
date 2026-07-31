import { fileURLToPath } from "node:url";
import { createAddonServer } from "./server/httpServer.js";
import { getPort } from "./utils/env.js";

export { getManifest } from "./addon/manifest.js";
export { getStreams } from "./services/streamService.js";
export { createAddonServer, getServerAddress, startAddonServer } from "./server/httpServer.js";
export { routeRequest } from "./server/router.js";
export { getPort } from "./utils/env.js";

export function main(): void {
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
