import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";

export type TorrentIndexerResponseMode =
  | "valid"
  | "partial"
  | "missing-results"
  | "wrong-results"
  | "invalid-json"
  | "404"
  | "500"
  | "slow"
  | "large";

export interface TorrentIndexerObservedRequest {
  pathname: string;
  searchParams: Record<string, string>;
}

export interface TorrentIndexerTestServer {
  readonly baseUrl: string;
  readonly requests: TorrentIndexerObservedRequest[];
  setMode(mode: TorrentIndexerResponseMode): void;
  close(): Promise<void>;
}

async function loadFixtures(): Promise<{ valid: unknown; invalid: unknown[] }> {
  const [valid, invalid] = await Promise.all([
    readFile(new URL("../fixtures/torrent-indexer/valid-response.json", import.meta.url), "utf8"),
    readFile(new URL("../fixtures/torrent-indexer/invalid-responses.json", import.meta.url), "utf8"),
  ]);
  return { valid: JSON.parse(valid) as unknown, invalid: JSON.parse(invalid) as unknown[] };
}

export async function startTorrentIndexerTestServer(): Promise<TorrentIndexerTestServer> {
  const fixtures = await loadFixtures();
  const requests: TorrentIndexerObservedRequest[] = [];
  let currentMode: TorrentIndexerResponseMode = "valid";
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    requests.push({ pathname: url.pathname, searchParams: Object.fromEntries(url.searchParams) });
    const mode = currentMode;

    if (mode === "404" || mode === "500") {
      response.statusCode = Number(mode);
      response.end(mode === "404" ? "not found" : "server error");
      return;
    }
    if (mode === "invalid-json") {
      response.end('{"results":');
      return;
    }
    if (mode === "large") {
      response.end(JSON.stringify({ results: [], padding: "x".repeat(4_096) }));
      return;
    }

    const payload =
      mode === "partial"
        ? { results: [(fixtures.valid as { results: unknown[] }).results[0], ...fixtures.invalid] }
        : mode === "missing-results"
          ? { count: 0 }
          : mode === "wrong-results"
            ? { results: "invalid" }
            : fixtures.valid;
    const send = () => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(payload));
    };

    if (mode === "slow") setTimeout(send, 100);
    else send();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Missing test address");

  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    requests,
    setMode(mode) {
      currentMode = mode;
    },
    async close() {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}
