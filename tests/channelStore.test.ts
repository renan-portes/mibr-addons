import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelStore } from "../src/tv/channelStore.js";

const SAMPLE_M3U = `
#EXTM3U
#EXTINF:-1 tvg-id="globo" group-title="Abertos",TV Globo
http://example.com/globo.m3u8
#EXTINF:-1 tvg-id="sbt" group-title="Abertos",SBT HD
http://example.com/sbt.m3u8
#EXTINF:-1 tvg-id="espn" group-title="Esportes",ESPN
http://example.com/espn.m3u8
#EXTINF:-1 tvg-id="sportv" group-title="Esportes",SporTV
http://example.com/sportv.m3u8
#EXTINF:-1 tvg-id="telecine" group-title="Filmes & Séries",Telecine Premium
http://example.com/tc.m3u8
`.trim();

describe("ChannelStore", () => {
  it("loads channels from initial M3U content", () => {
    const store = new ChannelStore({ initialContent: SAMPLE_M3U });
    const stats = store.getStats();

    assert.equal(stats.totalChannels, 5);
    assert.equal(stats.genres["Abertos"], 2);
    assert.equal(stats.genres["Esportes"], 2);
    assert.equal(stats.genres["Filmes & Séries"], 1);
  });

  it("filters channels by genre case-insensitively", () => {
    const store = new ChannelStore({ initialContent: SAMPLE_M3U });

    const esportes = store.getChannels({ genre: "esportes" });
    assert.equal(esportes.length, 2);
    assert.equal(esportes[0]?.name, "ESPN");
    assert.equal(esportes[1]?.name, "SporTV");

    const abertos = store.getChannels({ genre: "ABERTOS" });
    assert.equal(abertos.length, 2);
  });

  it("searches channels by query string", () => {
    const store = new ChannelStore({ initialContent: SAMPLE_M3U });

    const results = store.getChannels({ search: "telecine" });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.name, "Telecine Premium");

    const partial = store.getChannels({ search: "spor" });
    assert.equal(partial.length, 1);
    assert.equal(partial[0]?.name, "SporTV");
  });

  it("paginates channels using skip and limit", () => {
    const store = new ChannelStore({ initialContent: SAMPLE_M3U });

    const page1 = store.getChannels({ skip: 0, limit: 2 });
    assert.equal(page1.length, 2);
    assert.equal(page1[0]?.name, "TV Globo");
    assert.equal(page1[1]?.name, "SBT HD");

    const page2 = store.getChannels({ skip: 2, limit: 2 });
    assert.equal(page2.length, 2);
    assert.equal(page2[0]?.name, "ESPN");
    assert.equal(page2[1]?.name, "SporTV");
  });

  it("finds channel by ID", () => {
    const store = new ChannelStore({ initialContent: SAMPLE_M3U });
    const channel = store.getChannelById("mibr:tv:globo");

    assert.ok(channel);
    assert.equal(channel?.name, "TV Globo");
    assert.equal(channel?.streamUrl, "http://example.com/globo.m3u8");
  });

  it("loads 39 channels (open TV + sports) as default fallback when file is missing", () => {
    const store = new ChannelStore({ m3uPath: "./non-existent-path.m3u" });
    const channels = store.getChannels();
    assert.equal(channels.length, 39);
    assert.ok(channels.some((c) => c.name.includes("Globo SP")));
    assert.ok(channels.some((c) => c.name.includes("SBT SP")));
    assert.ok(channels.some((c) => c.name.includes("Band SP")));
    assert.ok(channels.some((c) => c.name.includes("Record SP")));
    assert.ok(channels.some((c) => c.name.includes("SporTV")));
    assert.ok(channels.some((c) => c.name.includes("ESPN")));
    assert.ok(channels.some((c) => c.name.includes("Cazé TV")));
  });
});
