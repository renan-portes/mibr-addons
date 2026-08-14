import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VidKingProvider } from "../src/providers/vidking/vidKingProvider.js";

describe("VidKingProvider", () => {
  it("generates embed stream for movie", async () => {
    const provider = new VidKingProvider();
    const streams = await provider.getStreams(
      { type: "movie", id: "tt1375666" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.equal(streams[0]?.name, "VidKing 🎬");
    assert.equal(streams[0]?.url, "https://vidking.net/embed/movie/tt1375666");
  });

  it("generates embed stream for TV series episode", async () => {
    const provider = new VidKingProvider();
    const streams = await provider.getStreams(
      { type: "series", id: "tt0944947:8:1" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 1);
    assert.equal(streams[0]?.name, "VidKing 🎬");
    assert.equal(streams[0]?.url, "https://vidking.net/embed/tv/tt0944947/8/1");
  });

  it("ignores invalid IMDb IDs", async () => {
    const provider = new VidKingProvider();
    const streams = await provider.getStreams(
      { type: "movie", id: "invalid" },
      new AbortController().signal,
    );

    assert.equal(streams.length, 0);
  });
});
