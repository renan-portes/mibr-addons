import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseM3U } from "../src/tv/m3uParser.js";

describe("M3U Parser", () => {
  it("parses valid M3U playlist with attributes and titles", () => {
    const content = `
#EXTM3U
#EXTINF:-1 tvg-id="globo.sp" tvg-name="Globo SP" tvg-logo="https://example.com/globo.png" group-title="TV Aberta",Globo SP FHD
https://streams.example.com/globo.m3u8
#EXTINF:-1 tvg-id="espn.br" tvg-name="ESPN Brasil" tvg-logo="https://example.com/espn.png" group-title="Esportes",ESPN Brasil HD
https://streams.example.com/espn.m3u8
    `.trim();

    const channels = parseM3U(content);
    assert.equal(channels.length, 2);

    assert.equal(channels[0]?.name, "Globo SP FHD");
    assert.equal(channels[0]?.group, "Abertos"); // Normalized from "TV Aberta"
    assert.equal(channels[0]?.logo, "https://example.com/globo.png");
    assert.equal(channels[0]?.streamUrl, "https://streams.example.com/globo.m3u8");
    assert.match(channels[0]?.id ?? "", /^mibr:tv:/);

    assert.equal(channels[1]?.name, "ESPN Brasil HD");
    assert.equal(channels[1]?.group, "Esportes");
    assert.equal(channels[1]?.streamUrl, "https://streams.example.com/espn.m3u8");
  });

  it("handles pipe-separated stream headers", () => {
    const content = `
#EXTM3U
#EXTINF:-1 tvg-id="premiere" group-title="Esportes",Premiere Clubes
http://stream.net/live.m3u8|User-Agent=CustomUA&Referer=https://iptv.org
    `.trim();

    const channels = parseM3U(content);
    assert.equal(channels.length, 1);
    assert.equal(channels[0]?.streamUrl, "http://stream.net/live.m3u8");
    assert.deepEqual(channels[0]?.httpHeaders, {
      "User-Agent": "CustomUA",
      Referer: "https://iptv.org",
    });
  });

  it("handles EXTVLCOPT header options", () => {
    const content = `
#EXTM3U
#EXTINF:-1 group-title="Notícias",GloboNews
#EXTVLCOPT:http-user-agent=VLC/3.0
#EXTVLCOPT:http-referrer=https://globo.com
http://stream.net/globonews.m3u8
    `.trim();

    const channels = parseM3U(content);
    assert.equal(channels.length, 1);
    assert.equal(channels[0]?.streamUrl, "http://stream.net/globonews.m3u8");
    assert.equal(channels[0]?.httpHeaders?.["User-Agent"], "VLC/3.0");
    assert.equal(channels[0]?.httpHeaders?.["Referer"], "https://globo.com");
  });

  it("ensures channel IDs are strictly unique even with identical names", () => {
    const content = `
#EXTM3U
#EXTINF:-1 group-title="Abertos",SBT
http://stream.com/sbt1.m3u8
#EXTINF:-1 group-title="Abertos",SBT
http://stream.com/sbt2.m3u8
#EXTINF:-1 group-title="Abertos",SBT
http://stream.com/sbt3.m3u8
    `.trim();

    const channels = parseM3U(content);
    assert.equal(channels.length, 3);
    const ids = channels.map((c) => c.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, 3);
    assert.equal(channels[0]?.id, "mibr:tv:sbt");
    assert.equal(channels[1]?.id, "mibr:tv:sbt-2");
    assert.equal(channels[2]?.id, "mibr:tv:sbt-3");
  });
});
