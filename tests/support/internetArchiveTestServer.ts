import { once } from "node:events";
import { createServer, type Server } from "node:http";

type ResponseMode = "success" | "404" | "500" | "invalid-json" | "slow";

export interface InternetArchiveTestServerOptions {
  searchPayload: string;
  metadataByIdentifier: Readonly<Record<string, string>>;
}

export interface InternetArchiveTestServer {
  readonly baseUrl: string;
  readonly requestCount: number;
  readonly lastRequestUrl: string | undefined;
  close(): Promise<void>;
}

function getMode(url: URL): ResponseMode {
  const mode = url.searchParams.get("mode") ?? "success";

  return ["success", "404", "500", "invalid-json", "slow"].includes(mode)
    ? (mode as ResponseMode)
    : "success";
}

export async function startInternetArchiveTestServer(
  options: InternetArchiveTestServerOptions,
): Promise<InternetArchiveTestServer> {
  let requestCount = 0;
  let lastRequestUrl: string | undefined;
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  const server: Server = createServer((request, response) => {
    requestCount += 1;
    lastRequestUrl = request.url;
    const url = new URL(request.url ?? "/", "http://localhost");
    const mode = getMode(url);

    const send = () => {
      if (mode === "404" || mode === "500") {
        response.statusCode = Number(mode);
        response.end(mode === "404" ? "not found" : "server error");
        return;
      }

      if (mode === "invalid-json") {
        response.end('{"invalid":');
        return;
      }

      response.setHeader("Content-Type", "application/json");

      if (url.pathname === "/advancedsearch.php") {
        response.end(options.searchPayload);
        return;
      }

      if (url.pathname.startsWith("/metadata/")) {
        const identifier = decodeURIComponent(url.pathname.slice("/metadata/".length));
        const metadata = options.metadataByIdentifier[identifier];

        if (metadata === undefined) {
          response.statusCode = 404;
          response.end("not found");
          return;
        }

        response.end(metadata);
        return;
      }

      response.statusCode = 404;
      response.end("not found");
    };

    if (mode === "slow") {
      const timer = setTimeout(() => {
        pendingTimers.delete(timer);
        send();
      }, 100);
      pendingTimers.add(timer);
      return;
    }

    send();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Unable to determine Internet Archive test server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    get requestCount() {
      return requestCount;
    },
    get lastRequestUrl() {
      return lastRequestUrl;
    },
    async close() {
      for (const timer of pendingTimers) {
        clearTimeout(timer);
      }
      pendingTimers.clear();
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}
