import { once } from "node:events";
import { createServer, type Server } from "node:http";

type ResponseMode = "success" | "404" | "500" | "invalid-json" | "empty" | "slow";

const moviePayload = {
  streams: [
    {
      type: "movie",
      id: "tt0111161",
      title: " The Shawshank Redemption ",
      quality: "1080p",
      language: "Português",
      url: "https://example.com/http/tt0111161-1080p.mp4",
    },
    {
      type: "movie",
      id: "tt0111161",
      title: "The Shawshank Redemption",
      quality: "720p",
      language: "English",
      url: "https://example.com/http/tt0111161-720p.mp4",
    },
    {
      type: "movie",
      id: "tt0068646",
      title: "The Godfather",
      quality: "1080p",
      language: "English",
      url: "https://example.com/http/tt0068646.mp4",
    },
    {
      type: "series",
      id: "tt0111161",
      title: "Wrong media type",
      quality: "480p",
      language: "English",
      url: "https://example.com/http/wrong-type.mp4",
    },
    {
      type: "movie",
      id: "tt0111161",
      title: "Invalid entry",
      quality: "1080p",
      language: "English",
      url: "javascript:alert(1)",
    },
  ],
};

const seriesPayload = {
  streams: [
    {
      type: "series",
      id: "tt0903747:1:1",
      title: "Breaking Bad S01E01",
      quality: "1080p",
      language: "Português",
      url: "https://example.com/http/tt0903747-s01e01.mp4",
    },
    {
      type: "series",
      id: "tt0903747:1:2",
      title: "Breaking Bad S01E02",
      quality: "720p",
      language: "English",
      url: "https://example.com/http/tt0903747-s01e02.mp4",
    },
  ],
};

function getMode(url: URL): ResponseMode {
  const mode = url.searchParams.get("mode") ?? "success";

  if (["success", "404", "500", "invalid-json", "empty", "slow"].includes(mode)) {
    return mode as ResponseMode;
  }

  return "success";
}

export interface HttpFixtureTestServer {
  readonly baseUrl: string;
  close(): Promise<void>;
}

export async function startHttpFixtureTestServer(): Promise<HttpFixtureTestServer> {
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const mode = getMode(url);

    if (url.pathname !== "/movies.json" && url.pathname !== "/series.json") {
      response.statusCode = 404;
      response.end();
      return;
    }

    if (mode === "404" || mode === "500") {
      response.statusCode = Number(mode);
      response.end(mode === "404" ? "not found" : "server error");
      return;
    }

    if (mode === "invalid-json") {
      response.end('{"streams":');
      return;
    }

    if (mode === "empty") {
      response.setHeader("Content-Type", "application/json");
      response.end('{"streams":[]}');
      return;
    }

    const sendPayload = () => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(url.pathname === "/movies.json" ? moviePayload : seriesPayload));
    };

    if (mode === "slow") {
      setTimeout(sendPayload, 100);
      return;
    }

    sendPayload();
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
    throw new Error("Unable to determine HTTP fixture server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}
