import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rewriteM3u8Playlist } from "../src/tv/streamProxy.js";

describe("StreamProxy HLS Rewriter", () => {
  it("rewrites relative and absolute segment URLs to proxy URLs", () => {
    const originalPlaylist = `
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment-001.ts
#EXTINF:10.0,
https://cdn.origin.com/live/segment-002.ts
#EXT-X-ENDLIST
    `.trim();

    const originUrl = "https://cdn.origin.com/live/playlist.m3u8";
    const proxyBase = "http://127.0.0.1:7000";

    const rewritten = rewriteM3u8Playlist(originalPlaylist, originUrl, proxyBase);

    // Segment 1 (relative) should be resolved against originBase and proxied
    const expectedSegment1 = `http://127.0.0.1:7000/proxy/segment?url=${encodeURIComponent("https://cdn.origin.com/live/segment-001.ts")}`;
    assert.ok(rewritten.includes(expectedSegment1));

    // Segment 2 (absolute) should also be proxied
    const expectedSegment2 = `http://127.0.0.1:7000/proxy/segment?url=${encodeURIComponent("https://cdn.origin.com/live/segment-002.ts")}`;
    assert.ok(rewritten.includes(expectedSegment2));

    // Ensure raw origin cdn URLs are not left unproxied
    assert.equal(rewritten.includes("https://cdn.origin.com/live/segment-001.ts\n"), false);
  });

  it("rewrites encryption key URI tags to proxy URLs", () => {
    const original = `
#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x01
#EXTINF:5.0,
chunk.ts
    `.trim();

    const originUrl = "https://origin.tv/stream.m3u8";
    const proxyBase = "http://127.0.0.1:7000";

    const rewritten = rewriteM3u8Playlist(original, originUrl, proxyBase);

    const expectedKey = `URI="${proxyBase}/proxy/segment?url=${encodeURIComponent("https://origin.tv/key.bin")}"`;
    assert.ok(rewritten.includes(expectedKey));
  });
});
