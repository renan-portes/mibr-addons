import assert from "node:assert/strict";
import { once } from "node:events";
import { describe, it, before, after } from "node:test";
import { createAddonServer, getServerAddress } from "../src/server/httpServer.js";
import { routeRequest } from "../src/server/router.js";

describe("router", () => {
  it("serves manifest.json", () => {
    const result = routeRequest("GET", "/manifest.json");

    assert.equal(result.status, 200);
    assert.equal(result.body && "id" in result.body ? result.body.id : null, "community.mibr.addons");
  });

  it("serves stream responses", () => {
    const result = routeRequest("GET", "/stream/movie/tt0111161.json");

    assert.equal(result.status, 200);
    assert.equal(result.body && "streams" in result.body ? result.body.streams.length : 0, 2);
  });

  it("returns 404 for unknown routes", () => {
    const result = routeRequest("GET", "/unknown.json");

    assert.equal(result.status, 404);
    assert.deepEqual(result.body, { error: "Not found" });
  });

  it("returns 400 for invalid stream requests", () => {
    const result = routeRequest("GET", "/stream/invalid/tt0111161.json");

    assert.equal(result.status, 400);
    assert.match(result.body && "error" in result.body ? result.body.error : "", /Unsupported type/);
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

    const manifestResponse = await fetch(`http://127.0.0.1:${port}/manifest.json`);
    assert.equal(manifestResponse.status, 200);
    assert.equal(manifestResponse.headers.get("content-type"), "application/json; charset=utf-8");

    const manifest = (await manifestResponse.json()) as { id: string };
    assert.equal(manifest.id, "community.mibr.addons");

    const streamResponse = await fetch(`http://127.0.0.1:${port}/stream/movie/tt0111161.json`);
    assert.equal(streamResponse.status, 200);

    const streams = (await streamResponse.json()) as { streams: unknown[] };
    assert.equal(streams.streams.length, 2);
  });
});
