import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeRequest } from "../src/server/router.js";
import { ChannelStore } from "../src/tv/channelStore.js";

const TEST_M3U = `
#EXTM3U
#EXTINF:-1 tvg-id="globo" group-title="Abertos",Globo SP
http://example.com/globo.m3u8
#EXTINF:-1 tvg-id="sportv" group-title="Esportes",SporTV HD
http://example.com/sportv.m3u8
`.trim();

describe("TV Router", () => {
  const channelStore = new ChannelStore({ initialContent: TEST_M3U });
  const hostUrl = "http://127.0.0.1:7000";

  it("serves configuration HTML on / and /configure", async () => {
    const res1 = await routeRequest("GET", "/", hostUrl, channelStore);
    assert.equal(res1.status, 200);
    assert.ok("html" in res1);
    assert.ok(res1.html.includes("MIBR TV"));

    const res2 = await routeRequest("GET", "/configure", hostUrl, channelStore);
    assert.equal(res2.status, 200);
    assert.ok("html" in res2);
  });

  it("serves manifest on /manifest.json with TV types and dynamic genres", async () => {
    const res = await routeRequest("GET", "/manifest.json", hostUrl, channelStore);
    assert.equal(res.status, 200);
    assert.ok("body" in res);
    assert.equal(res.body.id, "community.mibr.tv");
    assert.deepEqual(res.body.types, ["tv", "channel", "movie", "series"]);
    assert.deepEqual(res.body.resources, ["catalog", "meta", "stream"]);
    assert.ok(res.body.idPrefixes.includes("tt"));
    assert.ok(res.body.idPrefixes.includes("tmdb"));
    assert.ok(res.body.catalogs[0].extra[0].options.includes("Abertos"));
    assert.ok(res.body.catalogs[0].extra[0].options.includes("Esportes"));
  });

  it("serves channel catalog with filter support", async () => {
    // All channels
    const resAll = await routeRequest("GET", "/catalog/channel/mibr-tv-canais.json", hostUrl, channelStore);
    assert.equal(resAll.status, 200);
    assert.ok("body" in resAll);
    assert.equal(resAll.body.metas.length, 2);
    assert.equal(resAll.body.metas[0].type, "tv");

    // Filter by genre
    const resEsportes = await routeRequest(
      "GET",
      "/catalog/channel/mibr-tv-canais/genre=Esportes.json",
      hostUrl,
      channelStore
    );
    assert.equal(resEsportes.status, 200);
    assert.ok("body" in resEsportes);
    assert.equal(resEsportes.body.metas.length, 1);
    assert.equal(resEsportes.body.metas[0].name, "SporTV HD");

    // Dedicated category catalog
    const resAbertos = await routeRequest(
      "GET",
      "/catalog/channel/mibr-tv-abertos.json",
      hostUrl,
      channelStore
    );
    assert.equal(resAbertos.status, 200);
    assert.ok("body" in resAbertos);
    assert.equal(resAbertos.body.metas.length, 1);
    assert.equal(resAbertos.body.metas[0].name, "Globo SP");

    // Search
    const resSearch = await routeRequest(
      "GET",
      "/catalog/channel/mibr-tv-canais/search=globo.json",
      hostUrl,
      channelStore
    );
    assert.equal(resSearch.status, 200);
    assert.ok("body" in resSearch);
    assert.equal(resSearch.body.metas.length, 1);
    assert.equal(resSearch.body.metas[0].name, "Globo SP");
  });

  it("serves channel meta details", async () => {
    const res = await routeRequest("GET", "/meta/channel/mibr:tv:globo.json", hostUrl, channelStore);
    assert.equal(res.status, 200);
    assert.ok("body" in res);
    assert.equal(res.body.meta.name, "Globo SP");
    assert.deepEqual(res.body.meta.genres, ["Abertos"]);
  });

  it("returns 404 for unknown channel meta", async () => {
    const res = await routeRequest("GET", "/meta/channel/mibr:tv:non-existent.json", hostUrl, channelStore);
    assert.equal(res.status, 404);
  });

  it("serves unmasked stream URL directly", async () => {
    const res = await routeRequest("GET", "/stream/channel/mibr:tv:globo.json", hostUrl, channelStore);
    assert.equal(res.status, 200);
    assert.ok("body" in res);
    assert.equal(res.body.streams.length, 1);

    const stream = res.body.streams[0];
    assert.equal(stream.name, "MIBR TV");
    assert.equal(stream.url, "http://example.com/globo.m3u8");
    assert.equal(stream.behaviorHints.notWebReady, true);
  });

  it("serves configured manifest with only selected categories", async () => {
    const configPath = encodeURIComponent("tv_genres=Esportes|tv_all=false");
    const res = await routeRequest("GET", `/${configPath}/manifest.json`, hostUrl, channelStore);
    assert.equal(res.status, 200);
    assert.ok("body" in res);

    const catalogIds = res.body.catalogs.map((c: any) => c.id);
    assert.ok(catalogIds.includes("mibr-tv-esportes"));
    assert.ok(!catalogIds.includes("mibr-tv-abertos"));
    assert.ok(!catalogIds.includes("mibr-tv-canais"));
  });

  it("serves configured manifest with fenixflix disabled", async () => {
    const configPath = encodeURIComponent("fenix_enabled=false");
    const res = await routeRequest("GET", `/${configPath}/manifest.json`, hostUrl, channelStore);
    assert.equal(res.status, 200);
    assert.ok("body" in res);
    assert.deepEqual(res.body.types, ["tv", "channel"]);
    assert.deepEqual(res.body.idPrefixes, ["mibr:tv:"]);
    const hasFenixCatalogs = res.body.catalogs.some((c: any) => c.type === "movie" || c.type === "series");
    assert.equal(hasFenixCatalogs, false);
  });

  it("filters general channel catalog according to configured genres", async () => {
    const configPath = encodeURIComponent("tv_genres=Esportes");
    const res = await routeRequest(
      "GET",
      `/${configPath}/catalog/channel/mibr-tv-canais.json`,
      hostUrl,
      channelStore
    );
    assert.equal(res.status, 200);
    assert.ok("body" in res);
    assert.equal(res.body.metas.length, 1);
    assert.equal(res.body.metas[0].name, "SporTV HD");
  });

  it("returns empty catalog when requesting a disabled category", async () => {
    const configPath = encodeURIComponent("tv_genres=Esportes");
    const res = await routeRequest(
      "GET",
      `/${configPath}/catalog/channel/mibr-tv-abertos.json`,
      hostUrl,
      channelStore
    );
    assert.equal(res.status, 200);
    assert.ok("body" in res);
    assert.equal(res.body.metas.length, 0);
  });

  it("serves configured manifest with catalogs=none (no movie/series catalogs, but stream types preserved)", async () => {
    const configPath = encodeURIComponent("qualities=4k,1080p,720p,sd|audio=dublado,legendado|catalogs=none");
    const res = await routeRequest("GET", `/${configPath}/manifest.json`, hostUrl, channelStore);
    assert.equal(res.status, 200);
    assert.ok("body" in res);
    assert.deepEqual(res.body.types, ["tv", "channel", "movie", "series"]);
    assert.ok(res.body.idPrefixes.includes("tt"));
    const hasFenixCatalogs = res.body.catalogs.some((c: any) => c.type === "movie" || c.type === "series");
    assert.equal(hasFenixCatalogs, false);

    const resCat = await routeRequest("GET", `/${configPath}/catalog/movie/populares_fenix.json`, hostUrl, channelStore);
    assert.equal(resCat.status, 200);
    assert.deepEqual((resCat as any).body, { metas: [] });
  });
});
