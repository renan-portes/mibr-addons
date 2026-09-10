import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FenixFlixClient } from "../src/providers/fenixflix/fenixflixClient.js";
import { routeRequest } from "../src/server/router.js";
import { ChannelStore } from "../src/tv/channelStore.js";

describe("FenixFlix Client", () => {
  it("initializes with default options and catalogs when enabled", () => {
    const client = new FenixFlixClient({ enabled: true });
    assert.equal(client.isEnabled(), true);
    assert.equal(client.getUpstreamUrl(), "https://fenixflix.fenixhub.online");

    const catalogs = client.getCatalogs();
    assert.equal(catalogs.length, 4);
    assert.ok(catalogs.some((c) => c.type === "movie" && c.id === "populares_fenix"));
    assert.ok(catalogs.some((c) => c.type === "movie" && c.id === "recentes_servidor"));
    assert.ok(catalogs.some((c) => c.type === "series" && c.id === "populares_fenix"));
    assert.ok(catalogs.some((c) => c.type === "series" && c.id === "recentes_servidor"));
  });

  it("returns empty catalogs and responses when disabled", async () => {
    const client = new FenixFlixClient({ enabled: false });
    assert.equal(client.isEnabled(), false);
    assert.deepEqual(client.getCatalogs(), []);

    const cat = await client.fetchCatalog("movie", "populares_fenix");
    assert.deepEqual(cat, { metas: [] });

    const stream = await client.fetchStreams("movie", "tt12345");
    assert.deepEqual(stream, { streams: [] });
  });

  it("handles upstream failure gracefully without throwing", async () => {
    // Port 9999 is invalid/closed locally
    const client = new FenixFlixClient({
      enabled: true,
      upstreamUrl: "http://127.0.0.1:9999",
      timeoutMs: 500,
    });

    const cat = await client.fetchCatalog("movie", "populares_fenix");
    assert.deepEqual(cat, { metas: [] });

    const stream = await client.fetchStreams("movie", "tt12345");
    assert.deepEqual(stream, { streams: [] });
  });
});

describe("FenixFlix Router Integration", () => {
  const channelStore = new ChannelStore({ initialContent: "#EXTM3U\n#EXTINF:-1,Test\nhttp://test.com" });

  it("routes movie and series catalogs to FenixFlix client", async () => {
    let calledCatalog = false;
    const mockClient = new FenixFlixClient({ enabled: true });
    mockClient.fetchCatalog = async (type, id) => {
      calledCatalog = true;
      return {
        metas: [{ id: "tt12345", type: "movie", name: "Mock Movie" }],
      };
    };

    const res = await routeRequest(
      "GET",
      "/catalog/movie/populares_fenix.json",
      "http://127.0.0.1:7000",
      channelStore,
      mockClient
    );

    assert.equal(res.status, 200);
    assert.ok("body" in res);
    assert.equal(calledCatalog, true);
    assert.equal(res.body.metas[0].name, "Mock Movie");
  });

  it("routes movie and series streams to FenixFlix client", async () => {
    let calledStream = false;
    const mockClient = new FenixFlixClient({ enabled: true });
    mockClient.fetchStreams = async (type, id) => {
      calledStream = true;
      return {
        streams: [{ name: "FenixFlix", title: "Mock Stream", url: "http://mock.stream" }],
      };
    };

    const res = await routeRequest(
      "GET",
      "/stream/movie/tt12345.json",
      "http://127.0.0.1:7000",
      channelStore,
      mockClient
    );

    assert.equal(res.status, 200);
    assert.ok("body" in res);
    assert.equal(calledStream, true);
    assert.equal(res.body.streams[0].name, "FenixFlix");
  });
});
