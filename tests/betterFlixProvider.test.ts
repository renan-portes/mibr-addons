import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BetterFlixProvider } from "../src/providers/betterflix/betterFlixProvider.js";

describe("BetterFlixProvider", () => {
  it("generates embed stream for movie (Inception)", async () => {
    const provider = new BetterFlixProvider("test_key");
    const streams = await provider.getStreams(
      { type: "movie", id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.equal(streams[0]?.name, "BetterFlix 🍿");
    assert.match(streams[0]?.url ?? "", /betterflix\.lat\/api\/player\?id=27205&type=movie&key=test_key/);
  });

  it("generates embed stream for TV series episode (Game of Thrones S8E1)", async () => {
    const provider = new BetterFlixProvider("test_key");
    const streams = await provider.getStreams(
      { type: "series", id: "tt0944947:8:1" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.equal(streams[0]?.name, "BetterFlix 🍿");
    assert.match(streams[0]?.url ?? "", /betterflix\.lat\/api\/player\?id=1399&type=tv&season=8&episode=1&key=test_key/);
  });

  it("ignores non-movie/series queries or invalid IMDb IDs", async () => {
    const provider = new BetterFlixProvider("test_key");
    const streams = await provider.getStreams(
      { type: "channel" as any, id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 0);
  });
});
