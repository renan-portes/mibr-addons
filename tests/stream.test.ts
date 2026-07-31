import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getStreams } from "../src/services/streamService.js";

describe("stream service", () => {
  it("returns two mock streams for supported movie ids", () => {
    const streams = getStreams("movie", "tt1234567");

    assert.equal(streams.length, 2);
    assert.equal(streams[0]?.name, "MIBR Addons");
    assert.match(streams[0]?.url ?? "", /tt1234567$/);
    assert.match(streams[1]?.title ?? "", /720p/);
  });

  it("returns two mock streams for supported series ids", () => {
    const streams = getStreams("series", "tt7654321");

    assert.equal(streams.length, 2);
    assert.match(streams[0]?.title ?? "", /series/);
  });

  it("rejects unsupported types", () => {
    assert.throws(() => getStreams("anime", "tt1234567"), /Unsupported type/);
  });

  it("rejects ids without configured prefixes", () => {
    assert.throws(() => getStreams("movie", "imdb:123"), /Unsupported id prefix/);
  });
});
