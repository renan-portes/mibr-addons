import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { routeRequest } from "./router.js";

function sendJson(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
  });
  response.end(JSON.stringify(body));
}

export function createAddonServer(): Server {
  return createServer((request, response) => {
    try {
      const method = request.method ?? "GET";
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      const result = routeRequest(method, pathname);

      sendJson(response, result.status, result.body);
    } catch {
      sendJson(response, 500, { error: "Internal server error" });
    }
  });
}

export function startAddonServer(port: number): Promise<Server> {
  const server = createAddonServer();

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

export function getServerAddress(server: Server): AddressInfo {
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Unable to determine server address");
  }

  return address;
}
