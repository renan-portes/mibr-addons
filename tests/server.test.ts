import assert from "node:assert/strict";
import { once } from "node:events";
import { describe, it, before, after } from "node:test";
import { MockProvider } from "../src/providers/mockProvider.js";
import { createAddonServer, getServerAddress } from "../src/server/httpServer.js";
import { routeRequest } from "../src/server/router.js";
import { ProviderManager } from "../src/services/providerManager.js";
import { StreamService } from "../src/services/streamService.js";

process.env.TORRENTIO_BASE_URL = "mock";
process.env.BLUDV_BASE_URL = "mock";
process.env.TORRENTDOSFILMES_BASE_URL = "mock";

describe("router", () => {
  it("serves manifest.json", async () => {
    const result = await routeRequest("GET", "/manifest.json");

    assert.equal(result.status, 200);
    assert.equal(result.body && "id" in result.body ? result.body.id : null, "community.mibr.addons");
  });

  it("serves stream responses", async () => {
    const result = await routeRequest("GET", "/stream/movie/tt0111161.json");

    assert.equal(result.status, 200);
    assert.ok(result.body && "streams" in result.body ? result.body.streams.length > 0 : false);
  });

  it("returns 404 for unknown routes", async () => {
    const result = await routeRequest("GET", "/unknown.json");

    assert.equal(result.status, 404);
    assert.deepEqual(result.body, { error: "Not found" });
  });

  it("returns 400 for invalid stream requests", async () => {
    const result = await routeRequest("GET", "/stream/invalid/tt0111161.json");

    assert.equal(result.status, 400);
    assert.match(result.body && "error" in result.body ? result.body.error : "", /Unsupported type/);
  });

  it("aggregates streams from injected providers", async () => {
    const manager = new ProviderManager();
    manager.register(new MockProvider());
    manager.register({
      id: "extra",
      name: "Extra Provider",
      async getStreams() {
        return [
          {
            name: "Extra Provider",
            title: "Extra stream",
            url: "https://example.com/extra",
          },
        ];
      },
    });

    const streamService = new StreamService(manager);
    const result = await routeRequest("GET", "/stream/movie/tt0111161.json", streamService);

    assert.equal(result.status, 200);
    assert.equal(result.body && "streams" in result.body ? result.body.streams.length : 0, 3);
  });
});

describe("http server", () => {
  const server = createAddonServer();

  before(async () => {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, () => {
        server.off("error", reject);
        resolve();
      });
    });
  });

  after(async () => {
    server.close();
    await once(server, "close");
  });

  it("responds to HTTP requests", async () => {
    const { port } = getServerAddress(server);

    const optionsResponse = await fetch(`http://127.0.0.1:${port}/manifest.json`, { method: "OPTIONS" });
    assert.equal(optionsResponse.status, 204);
    assert.equal(optionsResponse.headers.get("access-control-allow-origin"), "*");

    const manifestResponse = await fetch(`http://127.0.0.1:${port}/manifest.json`);
    assert.equal(manifestResponse.status, 200);
    assert.equal(manifestResponse.headers.get("content-type"), "application/json; charset=utf-8");

    const manifest = (await manifestResponse.json()) as { id: string };
    assert.equal(manifest.id, "community.mibr.addons");

    const streamResponse = await fetch(`http://127.0.0.1:${port}/stream/movie/tt0111161.json`);
    assert.equal(streamResponse.status, 200);

    const streams = (await streamResponse.json()) as { streams: unknown[] };
    assert.ok(streams.streams.length > 0);
  });
});
